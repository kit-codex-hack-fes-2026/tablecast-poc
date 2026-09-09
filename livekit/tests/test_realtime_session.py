"""固定providerと本番Agentを実Sessionへ接続し、イベントから業務HTTPまで検証する。"""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from unittest.mock import create_autospec

import httpx
import pytest
from livekit import rtc
from livekit.agents import AgentSession, TurnHandlingOptions, llm, vad
from livekit.plugins import openai
from test_agent import configuration

from tablecast_livekit.api import RealtimeConfiguration, VoiceAPI
from tablecast_livekit.realtime import RealtimeTablecastAgent


async def stream[T](*items: T) -> AsyncIterator[T]:
    for item in items:
        yield item


@pytest.mark.parametrize(
    "tool_name", ["prepareConfirmation", "setLanguage"], ids=["固定確認", "言語変更"]
)
async def test_実Sessionが音声ターンとspeechを結び公開ツールを一度だけ実行する(
    monkeypatch: pytest.MonkeyPatch, tool_name: str
):
    # Given: 公開provider境界だけを固定し、Agentのhookとtoolは実物を使う。
    monkeypatch.setenv("OPENAI_API_KEY", "tablecast-test-key")
    requests: list[tuple[str, dict]] = []
    unexpected: list[str] = []
    authorising = asyncio.Event()
    authorised = asyncio.Event()
    finished = asyncio.Event()
    speeches = asyncio.Queue()

    async def response(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else {}
        requests.append((request.url.path, body))
        if request.url.path == "/internal/voice/turns":
            authorising.set()
            await authorised.wait()
            return httpx.Response(200, json={"ok": True})
        if request.url.path == "/internal/voice/tools":
            return httpx.Response(200, json={"result": {"voiceState": "stopped"}})
        if request.url.path.endswith("/confirmation"):
            finished.set()
            return httpx.Response(200, content=b"null")
        if request.url.path.endswith("/end") or request.url.path.endswith("/playback"):
            return httpx.Response(200, json={"ok": True})
        if request.url.path == "/internal/voice/transcript":
            return httpx.Response(200, json={"ok": True})
        unexpected.append(f"{request.method} {request.url.path}")
        return httpx.Response(500, json={"error": {"code": "UNEXPECTED_TEST_REQUEST"}})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = RealtimeTablecastAgent(
            VoiceAPI(client, "tablecast-voice"),
            configuration(),
            RealtimeConfiguration(
                model="gpt-realtime-2.1",
                instructions="接客",
                tools=[
                    {
                        "type": "function",
                        "name": tool_name,
                        "parameters": {"type": "object", "properties": {}},
                    }
                ],
            ),
        )
        provider = create_autospec(llm.RealtimeSession, instance=True)
        events = rtc.EventEmitter()
        provider.on.side_effect = events.on
        provider.off.side_effect = events.off
        assert isinstance(agent.llm, llm.RealtimeModel)
        provider.capabilities = agent.llm.capabilities
        provider.chat_ctx = llm.ChatContext()
        provider.tools = llm.ToolContext(agent.tools)

        generations = 0

        def generate_reply(**_options):
            nonlocal generations
            generations += 1
            result = asyncio.get_running_loop().create_future()
            if generations > 1:
                result.set_exception(llm.RealtimeError("台本にない追加生成"))
                return result
            events.emit(
                "remote_item_added",
                llm.RemoteItemAddedEvent(
                    None, llm.ChatMessage(id="tablecast-audio", role="user", content=[])
                ),
            )
            events.emit(
                "input_audio_transcription_completed",
                llm.InputTranscriptionCompleted(
                    item_id="tablecast-audio", transcript="注文します", is_final=True
                ),
            )
            result.set_result(
                llm.GenerationCreatedEvent(
                    message_stream=stream(),
                    function_stream=stream(
                        llm.FunctionCall(call_id="tablecast-call", name=tool_name, arguments="{}")
                    ),
                    user_initiated=True,
                )
            )
            return result

        provider.generate_reply.side_effect = generate_reply
        monkeypatch.setattr(
            openai.realtime.RealtimeModel, "session", lambda *_args, **_kw: provider
        )
        activity = asyncio.Queue[vad.VADEvent]()
        detector = create_autospec(vad.VAD, instance=True)
        detector.capabilities = vad.VADCapabilities(update_interval=0.1)
        detection = create_autospec(vad.VADStream, instance=True)
        detection.__aiter__.side_effect = lambda: detection
        detection.__anext__.side_effect = activity.get
        detector.stream.return_value = detection
        session = AgentSession(
            vad=detector,
            turn_handling=TurnHandlingOptions(
                turn_detection="vad",
                preemptive_generation={"enabled": False},
                interruption={"mode": "vad", "resume_false_interruption": False},
            ),
            user_away_timeout=None,
        )
        session.on("speech_created", lambda event: speeches.put_nowait(event.speech_handle))
        await session.start(agent, record=False)
        try:
            # When: 公開VAD streamから発話開始/終了を流し、APIの認可応答を保留する。
            for kind in [vad.VADEventType.START_OF_SPEECH, vad.VADEventType.END_OF_SPEECH]:
                activity.put_nowait(
                    vad.VADEvent(
                        type=kind,
                        samples_index=16000,
                        timestamp=time.time(),
                        speech_duration=1,
                        silence_duration=1,
                    )
                )
            await asyncio.wait_for(authorising.wait(), timeout=5)
            provider.generate_reply.assert_not_called()
            authorised.set()
            speech = await asyncio.wait_for(speeches.get(), timeout=5)
            await asyncio.wait_for(speech, timeout=5)
            if tool_name == "prepareConfirmation":
                await asyncio.wait_for(finished.wait(), timeout=5)
            await asyncio.gather(*agent.tasks)
            # Then: 内部のturn対応表へ代入せず、同じturnの字幕とtoolをHTTPから観測する。
            [started] = [body for path, body in requests if path == "/internal/voice/turns"]
            [tool] = [body for path, body in requests if path == "/internal/voice/tools"]
            [transcript] = [body for path, body in requests if path == "/internal/voice/transcript"]
            assert tool["turnId"] == transcript["turnId"] == started["turnId"]
            assert tool["toolName"] == tool_name
            assert tool["toolCallId"] == "tablecast-call"
            assert unexpected == []
            provider.generate_reply.assert_called_once()
            if tool_name == "setLanguage":
                assert agent.stopped
                assert not any(path.endswith("/confirmation") for path, _body in requests)
        finally:
            authorised.set()
            await session.aclose()
            await agent.close()
