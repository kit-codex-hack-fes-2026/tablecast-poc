"""公式pluginの公開接続と実Sessionで発話間の継続と速度変更を確認する。"""

import asyncio
import json
from unittest.mock import create_autospec

import aiohttp
import httpx
import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer
from livekit import rtc
from livekit.agents import AgentSession, TurnHandlingOptions
from livekit.agents.voice import io
from livekit.plugins import inworld, silero

from tablecast_livekit.agent import TablecastAgent
from tablecast_livekit.api import VoiceAPI, VoiceConfiguration
from tablecast_livekit.voice_text import VoiceTextPublisher


def configuration() -> VoiceConfiguration:
    return VoiceConfiguration(
        voiceSessionId="tablecast-continuity-voice",
        tableSessionId="tablecast-continuity-table",
        participantIdentity="tablecast-continuity-device",
        locale="ja",
        voice="tablecast-test-voice",
        releaseSha="tablecast-test",
        proactive=False,
    )


class AudioInput(io.AudioInput):
    def __init__(self) -> None:
        super().__init__(label="tablecast-test-audio")
        self.frames: asyncio.Queue[rtc.AudioFrame] = asyncio.Queue()

    async def __anext__(self) -> rtc.AudioFrame:
        return await self.frames.get()


@pytest.mark.parametrize(
    "labels",
    [[0, 0, 0, 0], [0, 0, 1, None], [None, None, None, None]],
    ids=["全語識別", "多数決", "全語未識別"],
)
async def test_実pluginとSessionの二往復でSTT接続と話者範囲を維持する(labels):
    connections: asyncio.Queue[web.WebSocketResponse] = asyncio.Queue()
    configs: list[dict] = []
    turns: list[dict] = []
    played: asyncio.Queue[dict] = asyncio.Queue()

    async def recognise(request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        async for message in ws:
            value = json.loads(message.data)
            if "transcribeConfig" in value:
                configs.append(value["transcribeConfig"])
                connections.put_nowait(ws)
        return ws

    async def response(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/turns"):
            turns.append(json.loads(request.content))
            return httpx.Response(
                200, headers={"content-type": "text/plain"}, text="[warm and calm]はい。"
            )
        if request.url.path.endswith("/confirmation"):
            return httpx.Response(200, content=b"null")
        if request.url.path.endswith("/playback"):
            played.put_nowait(json.loads(request.content))
        return httpx.Response(200, json={"ok": True})

    application = web.Application()
    application.router.add_get("/stt/v1/transcribe:streamBidirectional", recognise)
    async with TestServer(application) as server, aiohttp.ClientSession() as http:
        recogniser = inworld.STT(
            api_key="tablecast-test-key",
            base_url=str(server.make_url("/")),
            http_session=http,
            language="ja-JP",
            enable_voice_profile=False,
            enable_speaker_diarization=True,
            include_word_timestamps=True,
        )
        async with httpx.AsyncClient(
            base_url="https://tablecast.test", transport=httpx.MockTransport(response)
        ) as client:
            config = configuration()
            agent = TablecastAgent(VoiceAPI(client, config.voiceSessionId), config)
            agent.text_publisher = create_autospec(VoiceTextPublisher, instance=True)
            session = AgentSession(
                stt=recogniser,
                vad=silero.VAD.load(),
                turn_handling=TurnHandlingOptions(
                    turn_detection="vad",
                    preemptive_generation={"enabled": False},
                    interruption={"mode": "vad", "resume_false_interruption": False},
                ),
                user_away_timeout=None,
            )
            audio = AudioInput()
            session.input.audio = audio
            await session.start(agent, record=False)
            try:
                socket = await asyncio.wait_for(connections.get(), timeout=3)
                audio.frames.put_nowait(rtc.AudioFrame.create(16000, 1, 160))
                for index, text in enumerate(["おすすめは何ですか。", "それを一杯ください。"]):
                    await socket.send_json({"result": {"speechStarted": {}}})
                    await socket.send_json(
                        {
                            "result": {
                                "transcription": {
                                    "transcript": text,
                                    "isFinal": True,
                                    "wordTimestamps": [
                                        {
                                            "word": part,
                                            "startTimeMs": index * 1000 + word_index * 100,
                                            "endTimeMs": index * 1000 + word_index * 100 + 100,
                                            **({"speaker": label} if label is not None else {}),
                                        }
                                        for word_index, (part, label) in enumerate(
                                            zip(
                                                [text[:2], text[2:4], text[4:-1], text[-1:]],
                                                labels,
                                                strict=True,
                                            )
                                        )
                                    ],
                                }
                            }
                        }
                    )
                    await asyncio.wait_for(played.get(), timeout=5)
                assert len(configs) == 1
                assert configs[0]["enableSpeakerDiarization"] is True
                assert configs[0]["includeWordTimestamps"] is True
                assert configs[0].get("voiceProfileConfig") is None
                assert len(turns) == 2
                assert turns[0]["speaker"]["id"] == turns[1]["speaker"]["id"]
                assert turns[0]["speaker"]["streamId"] == turns[1]["speaker"]["streamId"]
                expected_id = (
                    f"{turns[1]['speaker']['streamId']}:0" if labels[0] is not None else None
                )
                assert turns[1]["speaker"]["id"] == expected_id
                displayed = [
                    call.args[0]
                    for call in agent.text_publisher.send.call_args_list
                    if call.args[0]["type"] == "user" and call.args[0]["final"]
                ]
                assert len(displayed) >= 2
                assert all(
                    message.get("speaker", {}).get("id") == expected_id for message in displayed
                )
                assert not socket.closed and connections.empty()
            finally:
                await session.aclose()
                await agent.close()


@pytest.mark.parametrize("stopped", [False, True], ids=["速度を次発話へ反映", "停止後は適用しない"])
async def test_設定同期が速度だけを更新し遅延応答で停止を取り消さない(stopped):
    config = configuration()
    received = asyncio.Event()
    respond = asyncio.Event()
    updated = asyncio.Event()
    synthesizer = create_autospec(inworld.TTS, instance=True)
    synthesizer.update_options.side_effect = lambda **kwargs: updated.set()

    async def response(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/internal/voice/config"
        assert request.url.params["voiceSessionId"] == config.voiceSessionId
        received.set()
        await respond.wait()
        return httpx.Response(200, json={**config.model_dump(), "speechSpeed": 1.4})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, config.voiceSessionId), config)
        syncing = asyncio.create_task(agent.sync_configuration(synthesizer))
        try:
            await asyncio.wait_for(received.wait(), timeout=3)
            if stopped:
                agent.stop()
            respond.set()
            if stopped:
                await asyncio.wait_for(syncing, timeout=1)
                synthesizer.update_options.assert_not_called()
                assert agent.config.speechSpeed == 1.0
            else:
                await asyncio.wait_for(updated.wait(), timeout=1)
                synthesizer.update_options.assert_called_once_with(speaking_rate=1.4)
                assert agent.config.speechSpeed == 1.4
                assert agent.config.voice == config.voice
                assert not agent.stopped
        finally:
            syncing.cancel()
            await asyncio.gather(syncing, return_exceptions=True)
            await agent.close()


@pytest.mark.parametrize("foreign", [False, True], ids=["認可失効", "別セッションの応答"])
async def test_設定同期の認可失効と別セッションを受けたら音声を停止する(foreign):
    config = configuration()
    synthesizer = create_autospec(inworld.TTS, instance=True)

    async def response(request: httpx.Request) -> httpx.Response:
        if not foreign:
            return httpx.Response(409, json={"error": {"code": "VOICE_STOPPED"}})
        return httpx.Response(
            200,
            json={
                **config.model_dump(),
                "voiceSessionId": "tablecast-other-session",
                "speechSpeed": 1.4,
            },
        )

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, config.voiceSessionId), config)
        session = AgentSession(user_away_timeout=None)
        await session.start(agent, record=False)
        try:
            await asyncio.wait_for(agent.sync_configuration(synthesizer), timeout=3)
            assert agent.stopped
            synthesizer.update_options.assert_not_called()
            assert agent.config.speechSpeed == 1.0
        finally:
            await session.aclose()
            await agent.close()


async def test_実TTSは同じ接続で新contextだけに変更速度を適用する():
    created: asyncio.Queue[dict] = asyncio.Queue()
    connections = 0

    async def synthesise(request: web.Request) -> web.WebSocketResponse:
        nonlocal connections
        connections += 1
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        async for message in ws:
            value = json.loads(message.data)
            if "create" in value:
                created.put_nowait(value)
                await ws.send_json(
                    {"result": {"contextId": value["contextId"], "contextCreated": {}}}
                )
            elif "close_context" in value:
                await ws.send_json(
                    {"result": {"contextId": value["contextId"], "contextClosed": {}}}
                )
        return ws

    application = web.Application()
    application.router.add_get("/tts/v1/voice:streamBidirectional", synthesise)
    async with TestServer(application) as server, aiohttp.ClientSession() as http:
        synthesizer = inworld.TTS(
            api_key="tablecast-test-key",
            base_url=str(server.make_url("/")),
            ws_url=str(server.make_url("/").with_scheme("ws")),
            http_session=http,
            voice="tablecast-test-voice",
            model="inworld-tts-2",
            language="ja-JP",
            delivery_mode="STABLE",
            speaking_rate=1.0,
        )
        try:
            async with synthesizer.stream() as first:
                old = await asyncio.wait_for(created.get(), timeout=3)
                synthesizer.update_options(speaking_rate=1.4)
                async with synthesizer.stream() as second:
                    new = await asyncio.wait_for(created.get(), timeout=3)
                    assert old["contextId"] != new["contextId"]
                    assert old["create"]["audioConfig"]["speakingRate"] == 1.0
                    assert new["create"]["audioConfig"]["speakingRate"] == 1.4
                    assert old["create"]["voiceId"] == new["create"]["voiceId"]
                    assert new["create"]["deliveryMode"] == "STABLE"
                    assert connections == 1
                    first.end_input()
                    second.end_input()
                    assert [packet async for packet in first] == []
                    assert [packet async for packet in second] == []
        finally:
            await synthesizer.aclose()
