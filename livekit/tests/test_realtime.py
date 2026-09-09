"""half-cascade固有のターン認可、字幕対応、取消を検証する。"""

import asyncio
from unittest.mock import AsyncMock, PropertyMock, create_autospec

import httpx
import pytest
from livekit.agents import (
    Agent,
    AgentSession,
    ModelSettings,
    RunContext,
    StopResponse,
    UserStateChangedEvent,
    llm,
)
from livekit.agents.voice import SpeechHandle
from test_agent import configuration

from tablecast_livekit.api import RealtimeConfiguration, RealtimeMessage, VoiceAPI
from tablecast_livekit.realtime import RealtimeTablecastAgent


@pytest.fixture
async def agent(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENAI_API_KEY", "tablecast-test-key")
    async with httpx.AsyncClient(base_url="https://tablecast.test") as client:
        api = VoiceAPI(client, "tablecast-voice")
        api.start_turn = AsyncMock()
        api.end_turn = AsyncMock()
        api.transcript = AsyncMock()
        api.tool = AsyncMock(return_value={"ok": True})
        value = RealtimeTablecastAgent(
            api,
            configuration(),
            RealtimeConfiguration(model="gpt-realtime-2.1", instructions="接客", tools=[]),
        )
        yield value
        await value.close()


async def test_字幕未着でも認可してから音声ターンを開始する(agent: RealtimeTablecastAgent):
    await agent.on_user_turn_completed(llm.ChatContext(), llm.ChatMessage(role="user", content=[]))
    assert agent.turn_id is not None
    assert list(agent.pending_audio_turns) == [agent.turn_id]
    assert isinstance(agent.llm, llm.RealtimeModel)
    assert not agent.llm.capabilities.audio_output
    assert isinstance(agent.api.start_turn, AsyncMock)
    agent.api.start_turn.assert_awaited_once_with(agent.turn_id, "ja", proactive=False)


async def test_遅延字幕を現在ターンへ取り違えず元の音声itemへ結ぶ(agent: RealtimeTablecastAgent):
    await agent.on_user_turn_completed(llm.ChatContext(), llm.ChatMessage(role="user", content=[]))
    first = agent.turn_id
    agent.remote_item_added(
        llm.RemoteItemAddedEvent(
            None, llm.ChatMessage(id="tablecast-audio", role="user", content=[])
        )
    )
    await agent.begin_turn()
    agent.transcribed(
        llm.InputTranscriptionCompleted(item_id="tablecast-audio", transcript="お茶", is_final=True)
    )
    await asyncio.gather(*agent.tasks)
    assert isinstance(agent.api.transcript, AsyncMock)
    agent.api.transcript.assert_awaited_once_with(first, "お茶")


async def test_旧speechのツールを新しいturnの資格で実行しない(agent: RealtimeTablecastAgent):
    old = await agent.begin_turn()
    speech = SpeechHandle.create(allow_interruptions=True)
    agent.speech_turns[speech.id] = old
    await agent.begin_turn()
    context = create_autospec(RunContext, instance=True)
    context.speech_handle = speech
    tool = agent.proxy_tool(
        {
            "type": "function",
            "name": "getCatalog",
            "parameters": {"type": "object", "properties": {}},
        }
    )
    with pytest.raises(StopResponse):
        await tool({}, context)
    assert isinstance(agent.api.tool, AsyncMock)
    agent.api.tool.assert_not_awaited()


async def test_固定確認準備後はモデルの追加生成を止める(agent: RealtimeTablecastAgent):
    turn = await agent.begin_turn()
    speech = SpeechHandle.create(allow_interruptions=True)
    agent.speech_turns[speech.id] = turn
    context = create_autospec(RunContext, instance=True)
    context.speech_handle = speech
    context.function_call = llm.FunctionCall(
        call_id="tablecast-call", name="prepareConfirmation", arguments="{}"
    )
    tool = agent.proxy_tool(
        {
            "type": "function",
            "name": "prepareConfirmation",
            "parameters": {"type": "object", "properties": {}},
        }
    )
    with pytest.raises(StopResponse):
        await tool({}, context)
    assert isinstance(agent.api.tool, AsyncMock)
    agent.api.tool.assert_awaited_once_with(turn, "prepareConfirmation", "tablecast-call", {})


async def test_モデル失敗を成功ターンとして固定確認へ進めない(
    agent: RealtimeTablecastAgent, monkeypatch: pytest.MonkeyPatch
):
    from livekit.agents.voice.events import SpeechCreatedEvent

    turn = await agent.begin_turn()
    speech = create_autospec(SpeechHandle, instance=True)
    speech.exception.return_value = None
    speech.interrupted = False
    agent.record_playback = AsyncMock()
    agent.read_confirmation = AsyncMock()
    agent.failed_turns.add(turn)
    await agent.finish_reply(
        turn,
        SpeechCreatedEvent(speech_handle=speech, user_initiated=False, source="generate_reply"),
    )
    assert isinstance(agent.api.end_turn, AsyncMock)
    agent.api.end_turn.assert_awaited_once_with(turn, "failed")
    agent.read_confirmation.assert_not_awaited()


async def test_ツールだけの空応答でInworldの無音streamを開始しない(
    agent: RealtimeTablecastAgent, monkeypatch: pytest.MonkeyPatch
):
    session = create_autospec(AgentSession, instance=True)
    session.current_speech = None
    monkeypatch.setattr(type(agent), "session", PropertyMock(return_value=session))
    synthesise = AsyncMock()
    monkeypatch.setattr(Agent.default, "tts_node", synthesise)

    async def empty_text():
        yield "[warm, composed and conversational]"

    assert [frame async for frame in agent.tts_node(empty_text(), ModelSettings())] == []
    synthesise.assert_not_called()


async def test_次の発話開始だけで再生完了したturnを中断へ変えない(
    agent: RealtimeTablecastAgent, monkeypatch: pytest.MonkeyPatch
):
    await agent.begin_turn()
    session = create_autospec(AgentSession, instance=True)
    speech = create_autospec(SpeechHandle, instance=True)
    speech.done.return_value = True
    session.current_speech = speech
    monkeypatch.setattr(type(agent), "session", PropertyMock(return_value=session))
    agent.user_state_changed(UserStateChangedEvent(old_state="listening", new_state="speaking"))
    assert agent.turn_id is None
    assert isinstance(agent.api.end_turn, AsyncMock)
    agent.api.end_turn.assert_not_awaited()


async def test_新しいAgentのモデル文脈に再開前の会話を復元する(
    agent: RealtimeTablecastAgent,
):
    resumed = RealtimeTablecastAgent(
        agent.api,
        configuration(),
        RealtimeConfiguration(
            model="gpt-realtime-2.1",
            instructions="同じ席の会話を続ける",
            tools=[],
            history=[
                RealtimeMessage(role="user", content="香りのよい日本酒が好きです"),
                RealtimeMessage(role="assistant", content="そらしずくと、", interrupted=True),
            ],
        ),
    )
    try:
        messages = [item for item in resumed.chat_ctx.items if isinstance(item, llm.ChatMessage)]
        assert [(item.role, item.text_content, item.interrupted) for item in messages] == [
            ("user", "香りのよい日本酒が好きです", False),
            ("assistant", "そらしずくと、", True),
        ]
        assert resumed.instructions == "同じ席の会話を続ける"
        assert resumed.turn_id is None
        assert not resumed.pending_audio_turns
        assert isinstance(agent.api.start_turn, AsyncMock)
        agent.api.start_turn.assert_not_awaited()
    finally:
        await resumed.close()
