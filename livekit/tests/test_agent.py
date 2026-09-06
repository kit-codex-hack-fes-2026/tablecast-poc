"""公開SessionとHTTP境界で自発接客を検証する。実STT/TTSは使用しない。"""

import asyncio
import json

import httpx
from livekit.agents import AgentSession, UserStateChangedEvent

from tablecast_livekit.agent import TablecastAgent
from tablecast_livekit.api import VoiceAPI, VoiceConfiguration


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


async def test_公開Sessionの無言イベントから客発話を偽造せず一度だけ自発接客を開始する():
    requests: list[httpx.Request] = []

    async def response(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/turns"):
            return httpx.Response(
                200, headers={"content-type": "text/plain"}, text="季節の料理もございます。"
            )
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, "tablecast-voice"), configuration())
        session = AgentSession(user_away_timeout=None)
        session.on("user_state_changed", agent.user_state_changed)
        await session.start(agent, record=False)
        try:
            session.emit(
                "user_state_changed", UserStateChangedEvent(old_state="listening", new_state="away")
            )
            speech = agent.proactive_speech
            assert speech is not None
            await asyncio.wait_for(speech, timeout=5)
            assert speech.exception() is None
            await asyncio.gather(*agent.tasks)
            turns = [
                json.loads(request.content)
                for request in requests
                if request.url.path.endswith("/turns")
            ]
            assert len(turns) == 1
            assert turns[0]["trigger"] == "proactive"
            assert turns[0]["messages"] == []
            assert "speaker" not in turns[0]
            assert not any("/confirmation" in request.url.path for request in requests)
            assert any(request.url.path.endswith("/playback") for request in requests)
            session.emit(
                "user_state_changed", UserStateChangedEvent(old_state="listening", new_state="away")
            )
            assert agent.proactive_speech is speech
        finally:
            await session.aclose()
            await agent.close()


async def test_APIが自発接客を見送ったら発話履歴も完了通知も作らない():
    requests: list[httpx.Request] = []

    async def response(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(204)

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, "tablecast-voice"), configuration())
        session = AgentSession(user_away_timeout=None)
        session.on("user_state_changed", agent.user_state_changed)
        await session.start(agent, record=False)
        try:
            session.emit(
                "user_state_changed", UserStateChangedEvent(old_state="listening", new_state="away")
            )
            speech = agent.proactive_speech
            assert speech is not None
            await asyncio.wait_for(speech, timeout=5)
            assert speech.exception() is None
            assert not speech.chat_items
            await asyncio.gather(*agent.tasks)
            assert len(requests) == 1
            assert requests[0].url.path == "/internal/voice/turns"
            await agent.close()
            session.emit(
                "user_state_changed", UserStateChangedEvent(old_state="listening", new_state="away")
            )
            assert len(requests) == 1
            assert agent.proactive_speech is speech
        finally:
            await session.aclose()
            await agent.close()


async def test_通常の客発話も実SessionからAPIへ渡り確認と再生記録へ進む():
    requests: list[httpx.Request] = []

    async def response(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/turns"):
            return httpx.Response(
                200, headers={"content-type": "text/plain"}, text="はい、お伺いします。"
            )
        if request.url.path.endswith("/confirmation"):
            return httpx.Response(200, json=None, content=b"null")
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, "tablecast-voice"), configuration())
        session = AgentSession(user_away_timeout=None)
        await session.start(agent, record=False)
        try:
            speech = session.generate_reply(user_input="おすすめは何ですか。")
            await asyncio.wait_for(speech, timeout=5)
            assert speech.exception() is None
            await asyncio.gather(*agent.tasks)
            turn = next(
                json.loads(request.content)
                for request in requests
                if request.url.path.endswith("/turns")
            )
            assert turn["trigger"] == "user"
            assert turn["messages"] == [{"role": "user", "content": "おすすめは何ですか。"}]
            assert any(request.url.path.endswith("/confirmation") for request in requests)
            playback = next(
                json.loads(request.content)
                for request in requests
                if request.url.path.endswith("/playback")
            )
            assert playback["text"] == "はい、お伺いします。"
            assert playback["interrupted"] is False
        finally:
            await session.aclose()
            await agent.close()


class WaitingStream(httpx.AsyncByteStream):
    def __init__(self) -> None:
        self.reading = asyncio.Event()
        self.closed = asyncio.Event()

    async def __aiter__(self):
        self.reading.set()
        await asyncio.Event().wait()
        yield b""

    async def aclose(self) -> None:
        self.closed.set()


async def test_客が話し始めると自発生成のHTTPを閉じ通常の応答は中断しない():
    stream = WaitingStream()
    requests: list[httpx.Request] = []

    async def response(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/turns"):
            data = json.loads(request.content)
            if data["trigger"] == "proactive":
                return httpx.Response(200, headers={"content-type": "text/plain"}, stream=stream)
            return httpx.Response(
                200, headers={"content-type": "text/plain"}, text="かしこまりました。"
            )
        if request.url.path.endswith("/confirmation"):
            return httpx.Response(200, content=b"null")
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, "tablecast-voice"), configuration())
        session = AgentSession(user_away_timeout=None)
        session.on("user_state_changed", agent.user_state_changed)
        await session.start(agent, record=False)
        try:
            session.emit(
                "user_state_changed", UserStateChangedEvent(old_state="listening", new_state="away")
            )
            speech = agent.proactive_speech
            assert speech is not None
            await asyncio.wait_for(stream.reading.wait(), timeout=5)
            session.emit(
                "user_state_changed", UserStateChangedEvent(old_state="away", new_state="speaking")
            )
            await asyncio.wait_for(speech, timeout=5)
            await asyncio.wait_for(stream.closed.wait(), timeout=5)
            assert speech.interrupted
            normal = session.generate_reply(user_input="店員さんをお願いします。")
            await asyncio.wait_for(normal, timeout=5)
            assert normal.exception() is None
            assert not normal.interrupted
            await asyncio.gather(*agent.tasks)
            turns = [
                json.loads(request.content)
                for request in requests
                if request.url.path.endswith("/turns")
            ]
            assert [turn["trigger"] for turn in turns] == ["proactive", "user"]
            assert not any("role" not in item for item in turns[1]["messages"])
        finally:
            await session.aclose()
            await agent.close()


async def test_通常応答の生成中は自発接客を開始せず終了時にHTTPを閉じる():
    stream = WaitingStream()
    requests: list[httpx.Request] = []

    async def response(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/turns"):
            return httpx.Response(200, headers={"content-type": "text/plain"}, stream=stream)
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, "tablecast-voice"), configuration())
        session = AgentSession(user_away_timeout=None)
        session.on("user_state_changed", agent.user_state_changed)
        await session.start(agent, record=False)
        speech = session.generate_reply(user_input="料理を説明してください。")
        await asyncio.wait_for(stream.reading.wait(), timeout=5)
        session.emit(
            "user_state_changed", UserStateChangedEvent(old_state="listening", new_state="away")
        )
        assert agent.proactive_speech is None
        agent.stopped = True
        await session.aclose()
        await agent.close()
        await asyncio.wait_for(stream.closed.wait(), timeout=5)
        assert speech.interrupted
        assert not agent.tasks
        turns = [request for request in requests if request.url.path.endswith("/turns")]
        assert len(turns) == 1


async def test_生成APIが失敗しても自動再試行で同じ業務turnを再実行しない():
    requests: list[httpx.Request] = []

    async def response(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/turns"):
            return httpx.Response(503, json={"error": {"code": "VOICE_MODEL_FAILED"}})
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, "tablecast-voice"), configuration())
        session = AgentSession(user_away_timeout=None)
        await session.start(agent, record=False)
        try:
            speech = session.generate_reply(user_input="注文をお願いします。")
            await asyncio.wait_for(speech, timeout=5)
            assert speech.exception() is not None
            await asyncio.gather(*agent.tasks)
            assert (
                len([request for request in requests if request.url.path.endswith("/turns")]) == 1
            )
            assert any(
                json.loads(request.content).get("status") == "failed"
                for request in requests
                if request.url.path.endswith("/end")
            )
        finally:
            await session.aclose()
            await agent.close()
