"""端末向けの逐次表示をSDKの公開送信・AgentSession境界で検証する。"""

import asyncio
import json
from unittest.mock import create_autospec

import httpx
import pytest
from livekit import rtc
from livekit.agents import Agent, AgentSession, LanguageCode, ModelSettings, stt

from tablecast_livekit.agent import TablecastAgent
from tablecast_livekit.api import VoiceAPI, VoiceConfiguration
from tablecast_livekit.voice_text import VoiceTextPublisher


@pytest.fixture
async def transport():
    participant = create_autospec(rtc.LocalParticipant, instance=True)
    packets: asyncio.Queue[dict] = asyncio.Queue()

    async def publish(payload, **options):
        packets.put_nowait(json.loads(payload))

    participant.publish_data.side_effect = publish
    publisher = VoiceTextPublisher(participant, "tablecast-device", lambda: True)
    try:
        yield publisher, packets, participant
    finally:
        await publisher.aclose()
        for call in participant.publish_data.await_args_list:
            assert call.kwargs == {
                "reliable": True,
                "topic": "tablecast.voice",
                "destination_identities": ["tablecast-device"],
            }
            assert len(call.args[0]) <= 15 * 1024


async def test_累積表示を合流し旧turnの未送信本文を破棄する(transport):
    publisher, packets, participant = transport
    publisher.begin_turn("tablecast-old")
    publisher.send(
        {
            "type": "assistant",
            "turnId": "tablecast-old",
            "text": "旧",
            "rawText": "旧",
            "final": False,
        }
    )
    publisher.begin_turn("tablecast-current")
    for text in ["は", "はい", "はい。"]:
        publisher.send(
            {
                "type": "assistant",
                "turnId": "tablecast-current",
                "text": text,
                "rawText": text,
                "final": text.endswith("。"),
            }
        )
    packet = await asyncio.wait_for(packets.get(), timeout=2)
    assert packet == {
        "type": "assistant",
        "turnId": "tablecast-current",
        "text": "はい。",
        "rawText": "はい。",
        "final": True,
    }
    assert participant.publish_data.await_count == 1
    publisher.interrupt("tablecast-current")
    publisher.send(
        {
            "type": "assistant",
            "turnId": "tablecast-current",
            "text": "遅延",
            "rawText": "遅延",
            "final": True,
        }
    )
    assert await asyncio.wait_for(packets.get(), timeout=2) == {
        "type": "interrupted",
        "turnId": "tablecast-current",
    }


async def test_送信が滞留しても入力を待たせず停止で未送信更新と送信taskを破棄する(transport):
    publisher, packets, participant = transport
    entered = asyncio.Event()

    async def blocked(*args, **kwargs):
        entered.set()
        await asyncio.Event().wait()

    participant.publish_data.side_effect = blocked
    publisher.send({"type": "user", "id": "tablecast-user-first", "text": "はい", "final": False})
    await asyncio.wait_for(entered.wait(), timeout=2)
    for index in range(100):
        publisher.send(
            {"type": "user", "id": f"tablecast-user-{index}", "text": "更新", "final": True}
        )
    assert len(publisher.pending) == 64
    await asyncio.wait_for(publisher.aclose(), timeout=1)
    publisher.send({"type": "user", "id": "tablecast-user-late", "text": "停止後", "final": True})
    assert not publisher.pending
    assert publisher.task.cancelled()
    assert participant.publish_data.await_count == 1
    assert packets.empty()


async def test_15KiBを超える累積本文を完全版として切り詰めず固定エラーで終了する(transport):
    publisher, packets, _ = transport
    publisher.begin_turn("tablecast-large")
    text = "日本語" * 2000
    publisher.send(
        {
            "type": "assistant",
            "turnId": "tablecast-large",
            "text": text,
            "rawText": text,
            "final": False,
        }
    )
    publisher.send(
        {
            "type": "assistant",
            "turnId": "tablecast-large",
            "text": text + "。",
            "rawText": text + "。",
            "final": True,
        }
    )
    assert await asyncio.wait_for(packets.get(), timeout=2) == {
        "type": "error",
        "turnId": "tablecast-large",
        "code": "VOICE_TEXT_TOO_LARGE",
    }


def configuration() -> VoiceConfiguration:
    return VoiceConfiguration(
        voiceSessionId="tablecast-voice",
        tableSessionId="tablecast-table",
        participantIdentity="tablecast-device",
        locale="ja",
        voice="tablecast-test-voice",
        releaseSha="tablecast-test",
        proactive=False,
    )


@pytest.mark.parametrize("speaker", ["0", None], ids=["話者ゼロ", "話者欠損"])
async def test_STT暫定と確定を同じIDで送り公開話者だけを保持する(transport, monkeypatch, speaker):
    publisher, packets, _ = transport
    final = asyncio.Event()
    interim = stt.SpeechEvent(
        type=stt.SpeechEventType.INTERIM_TRANSCRIPT,
        request_id="tablecast-stream",
        alternatives=[
            stt.SpeechData(language=LanguageCode("ja-JP"), text="[乾杯]", speaker_id=speaker)
        ],
    )
    confirmed = stt.SpeechEvent(
        type=stt.SpeechEventType.FINAL_TRANSCRIPT,
        request_id="tablecast-stream",
        alternatives=[
            stt.SpeechData(language=LanguageCode("ja-JP"), text="[乾杯]を二杯", speaker_id=speaker)
        ],
    )

    async def recognised(*args, **kwargs):
        yield stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
        yield interim
        await final.wait()
        yield confirmed
        yield stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH)

    async def audio():
        if False:
            yield rtc.AudioFrame.create(16000, 1, 160)

    monkeypatch.setattr(Agent.default, "stt_node", recognised)
    async with httpx.AsyncClient(base_url="https://tablecast.test") as client:
        agent = TablecastAgent(VoiceAPI(client, "tablecast-voice"), configuration())
        agent.text_publisher = publisher

        async def read():
            return [event async for event in agent.stt_node(audio(), ModelSettings())]

        reading = asyncio.create_task(read())
        try:
            first = await asyncio.wait_for(packets.get(), timeout=2)
            assert first["text"] == "[乾杯]" and first["final"] is False
            if speaker is not None:
                assert first["speaker"] == {"id": speaker, "streamId": "tablecast-stream"}
            else:
                assert "speaker" not in first
            final.set()
            events = await asyncio.wait_for(reading, timeout=2)
            last = await asyncio.wait_for(packets.get(), timeout=2)
            assert last["id"] == first["id"]
            assert last["text"] == "[乾杯]を二杯" and last["final"] is True
            assert last.get("speaker") == first.get("speaker")
            assert interim in events and confirmed in events
        finally:
            reading.cancel()
            await asyncio.gather(reading, return_exceptions=True)
            await agent.close()


class DelayedText(httpx.AsyncByteStream):
    def __init__(self):
        self.continue_stream = asyncio.Event()
        self.closed = False

    async def __aiter__(self):
        yield b"[warm"
        yield " and calm]はい。".encode()
        await self.continue_stream.wait()
        yield "二杯ですね。".encode()

    async def aclose(self):
        self.closed = True


@pytest.mark.parametrize(
    "interrupted", [False, True], ids=["最終本文をflush", "中断後の本文を破棄"]
)
async def test_実SessionのLLM完了を待たずに表示本文とdebug原文を配信する(transport, interrupted):
    publisher, packets, _ = transport
    source = DelayedText()

    async def response(request):
        if request.url.path.endswith("/turns"):
            return httpx.Response(200, headers={"content-type": "text/plain"}, stream=source)
        if request.url.path.endswith("/confirmation"):
            return httpx.Response(200, content=b"null")
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, "tablecast-voice"), configuration())
        agent.text_publisher = publisher
        session = AgentSession(user_away_timeout=None)
        await session.start(agent, record=False)
        try:
            speech = session.generate_reply(user_input="二杯ください。")
            partial = await asyncio.wait_for(packets.get(), timeout=3)
            assert partial == {
                "type": "assistant",
                "turnId": agent.turn_id,
                "text": "はい。",
                "rawText": "[warm and calm]はい。",
                "final": False,
            }
            assert not speech.done()
            if interrupted:
                speech.interrupt()
            else:
                source.continue_stream.set()
            await asyncio.wait_for(speech, timeout=3)
            await asyncio.gather(*agent.tasks)
            last = await asyncio.wait_for(packets.get(), timeout=3)
            if interrupted:
                assert last == {"type": "interrupted", "turnId": partial["turnId"]}
            else:
                assert last == {
                    **partial,
                    "text": "はい。二杯ですね。",
                    "rawText": "[warm and calm]はい。二杯ですね。",
                    "final": True,
                }
            assert source.closed
        finally:
            await session.aclose()
            await agent.close()
