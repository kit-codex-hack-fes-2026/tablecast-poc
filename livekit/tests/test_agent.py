"""公開GPT-LiveイベントとHTTP境界で委任・保存・停止を検証する。"""

import asyncio
import json
from unittest.mock import create_autospec

import httpx
import pytest
from livekit.agents import ConversationItemAddedEvent, UserStateChangedEvent, llm
from livekit.plugins.openai.realtime import GPTLiveDelegation, GPTLiveSession

from tablecast_livekit.agent import TablecastAgent
from tablecast_livekit.api import LiveConfiguration, VoiceAPI, VoiceConfiguration


def configuration() -> VoiceConfiguration:
    return VoiceConfiguration(
        voiceSessionId="tablecast-voice",
        tableSessionId="tablecast-table",
        participantIdentity="tablecast-device",
        locale="ja",
        voice="marin",
        releaseSha="tablecast-test",
        proactive=False,
    )


@pytest.fixture
async def agent(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "tablecast-test-key")
    calls = []

    async def handle(request):
        body = json.loads(request.content) if request.content else {}
        calls.append((request.url.path, body))
        if request.url.path == "/internal/voice/turns":
            return httpx.Response(
                200, headers={"content-type": "text/plain"}, text="二杯で八百円です。注文しますか？"
            )
        return httpx.Response(200, json={"ok": True})

    duplex = create_autospec(GPTLiveSession, instance=True)
    monkeypatch.setattr(TablecastAgent, "duplex_session", property(lambda self: duplex))
    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(handle)
    ) as client:
        value = TablecastAgent(
            VoiceAPI(client, "tablecast-voice"),
            configuration(),
            LiveConfiguration(
                model="gpt-live-1",
                instructions="接客",
                history=[{"role": "user", "content": "ほうじ茶の話です"}],
            ),
        )
        yield value, duplex, calls
        await value.close()


async def test_途中字幕と履歴をMastraへ委任して同じ委任IDへ結果を返す(agent):
    # Given: 前の会話と、まだ確定していない現在の発話。
    value, duplex, calls = agent
    await value.on_enter()
    duplex.on.assert_called_once_with("delegation_created", value.delegation_created)
    delegation = GPTLiveDelegation(id="tablecast-delegation", pending_transcript="二杯ください")
    # When: 同じ発話が二度委任される。
    value.delegation_created(delegation)
    value.delegation_created(delegation)
    await asyncio.gather(*value.tasks)
    # Then: HTTPは一回だけで、本文は会話履歴として保存しない。
    turns = [body for path, body in calls if path == "/internal/voice/turns"]
    assert len(turns) == 1
    assert turns[0]["transport"] == "live"
    assert turns[0]["messages"] == [
        {"role": "user", "content": "ほうじ茶の話です"},
        {"role": "user", "content": "二杯ください"},
    ]
    duplex.append_commentary.assert_called_once_with(
        "二杯で八百円です。注文しますか？", delegation_id="tablecast-delegation"
    )
    assert not any(path.endswith("conversation") for path, _ in calls)


async def test_次の客発話の委任だけが新しい業務turnになる(agent):
    value, _, calls = agent
    value.delegation_created(GPTLiveDelegation(id="first", pending_transcript="二杯ください"))
    await asyncio.gather(*value.tasks)
    value.user_state_changed(UserStateChangedEvent(old_state="listening", new_state="speaking"))
    value.delegation_created(GPTLiveDelegation(id="next", pending_transcript="はいお願いします"))
    await asyncio.gather(*value.tasks)
    turns = [body for path, body in calls if path == "/internal/voice/turns"]
    assert len(turns) == 2
    assert turns[0]["turnId"] != turns[1]["turnId"]


@pytest.mark.parametrize("role", ["user", "assistant"])
async def test_委任のない雑談もSDKの会話itemから保存する(agent, role):
    value, duplex, calls = agent
    item = llm.ChatMessage(id="tablecast-item", role=role, content=["ありがとう"])
    value.conversation_item_added(ConversationItemAddedEvent(item=item))
    await asyncio.gather(*value.tasks)
    assert calls == [
        (
            "/internal/voice/conversation",
            {
                "voiceSessionId": "tablecast-voice",
                "itemId": "tablecast-item",
                "role": role,
                "text": "ありがとう",
                "interrupted": False,
            },
        )
    ]
    duplex.append_commentary.assert_not_called()


async def test_停止後は新しい委任と字幕保存を受け付けない(agent):
    value, duplex, calls = agent
    value.stop()
    value.delegation_created(GPTLiveDelegation(id="late", pending_transcript="注文して"))
    value.conversation_item_added(
        ConversationItemAddedEvent(item=llm.ChatMessage(role="user", content=["はい"]))
    )
    await asyncio.sleep(0)
    assert calls == []
    duplex.append_commentary.assert_not_called()


async def test_処理中の停止はHTTPを閉じ途中結果を発話しない(agent, monkeypatch):
    value, duplex, calls = agent
    waiting = asyncio.Event()
    closed = asyncio.Event()

    async def stream(*args, **kwargs):
        try:
            yield "まだ処理中"
            waiting.set()
            await asyncio.Event().wait()
        finally:
            closed.set()

    monkeypatch.setattr(value.api, "stream_turn", stream)
    value.delegation_created(GPTLiveDelegation(id="waiting", pending_transcript="注文して"))
    await waiting.wait()
    value.stop()
    await asyncio.gather(*value.tasks, return_exceptions=True)
    assert closed.is_set()
    duplex.append_commentary.assert_not_called()
    assert calls[-1][1]["status"] == "interrupted"


async def test_長い委任結果を上限以内で欠落なく渡す(agent, monkeypatch):
    value, duplex, _ = agent
    result = "ほうじ茶は二杯です。" * 80

    async def stream(*args, **kwargs):
        yield result

    monkeypatch.setattr(value.api, "stream_turn", stream)
    await value.delegate(
        GPTLiveDelegation(id="long", pending_transcript="詳しく教えて"), value.utterance_id
    )
    parts = [call.args[0] for call in duplex.append_commentary.call_args_list]
    assert "".join(parts) == result
    assert all(len(part.encode()) <= 400 for part in parts)


async def test_実AgentSessionが委任と発話開始をアプリへ伝える(monkeypatch):
    # Given: ネットワーク境界だけを固定し、実SDKのsessionとadapterを起動する。
    from livekit import rtc
    from livekit.agents import AgentSession
    from livekit.agents.utils import aio
    from livekit.plugins.openai.realtime import GPTLiveModel

    monkeypatch.setenv("OPENAI_API_KEY", "tablecast-test-key")
    emitter = rtc.EventEmitter()
    audio = aio.Chan()
    duplex = create_autospec(GPTLiveSession, instance=True)
    duplex.on.side_effect = emitter.on
    duplex.off.side_effect = emitter.off
    duplex.audio_stream = audio
    duplex.tools = llm.ToolContext([])

    def open_session(model):
        duplex.capabilities = model.capabilities
        duplex.duplex_model = model
        return duplex

    monkeypatch.setattr(GPTLiveModel, "session", open_session)
    requests = []

    async def handle(request):
        if request.url.path == "/internal/voice/turns":
            requests.append(json.loads(request.content))
            return httpx.Response(200, text="確認しました")
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(handle)
    ) as client:
        value = TablecastAgent(
            VoiceAPI(client, "tablecast-voice"),
            configuration(),
            LiveConfiguration(model="gpt-live-1", instructions="接客"),
        )
        session = AgentSession()
        session.on("user_state_changed", value.user_state_changed)
        try:
            await session.start(agent=value)
            # When: providerから二つの発話開始と委任を受ける。
            for index in range(2):
                emitter.emit("input_speech_started", llm.InputSpeechStartedEvent())
                emitter.emit(
                    "delegation_created",
                    GPTLiveDelegation(id=str(index), pending_transcript="ほうじ茶"),
                )
                await asyncio.gather(*value.tasks)
                emitter.emit(
                    "input_speech_stopped",
                    llm.InputSpeechStoppedEvent(user_transcription_enabled=False),
                )
            # Then: 独立した業務turnになり、同じ公開duplex sessionへ返答する。
            assert len(requests) == 2
            assert requests[0]["turnId"] != requests[1]["turnId"]
            assert duplex.append_commentary.call_count == 2
        finally:
            audio.close()
            await value.close()
            await session.aclose()
        duplex.aclose.assert_awaited()


async def test_委任前の待機発話があっても最後の客発話を渡す(agent):
    value, duplex, calls = agent
    history = value.chat_ctx.copy()
    history.add_message(role="assistant", content="確認しますね")
    await value.update_chat_ctx(history)
    await value.delegate(
        GPTLiveDelegation(id="after-user", pending_transcript=""), value.utterance_id
    )
    assert calls[0][1]["messages"][-1] == {"role": "user", "content": "ほうじ茶の話です"}
    duplex.append_commentary.assert_called_once()
