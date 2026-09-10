"""診断IDの対応と非漏洩をHTTP境界・公開LiveKit Sessionで検証する。"""

import asyncio
import json
import logging

import httpx
import pytest
from livekit.agents import AgentSession, llm
from livekit.agents.metrics import LLMMetrics

from tablecast_livekit.agent import TablecastAgent
from tablecast_livekit.api import TurnSkipped, VoiceAPI, VoiceConfiguration
from tablecast_livekit.llm import TablecastLLM


@pytest.fixture
def config() -> VoiceConfiguration:
    return VoiceConfiguration(
        voiceSessionId="tablecast-diagnostic-voice",
        tableSessionId="tablecast-diagnostic-table",
        participantIdentity="tablecast-diagnostic-device",
        locale="ja",
        voice="tablecast-test-voice",
        releaseSha="tablecast-diagnostic-release",
        proactive=False,
    )


def records(caplog: pytest.LogCaptureFixture, event: str) -> list[dict[str, object]]:
    return [record.__dict__ for record in caplog.records if record.__dict__.get("event") == event]


def assert_private(caplog: pytest.LogCaptureFixture) -> None:
    captured = caplog.text + json.dumps([record.__dict__ for record in caplog.records], default=str)
    assert "tablecast-private" not in captured
    assert all(
        record.exc_info is None for record in caplog.records if record.name == "tablecast.voice"
    )


class BrokenStream(httpx.AsyncByteStream):
    async def __aiter__(self):
        yield b"tablecast-private-output"
        raise httpx.ReadError("tablecast-private-provider-error")


@pytest.mark.parametrize(
    ("outcome", "phase", "status"),
    [
        ("success", "completed", 200),
        ("skipped", "skipped", 204),
        ("rejected", "rejected", 409),
        ("server_error", "failed", 503),
        ("stream_error", "failed", 200),
        ("connection_error", "failed", None),
    ],
    ids=["成功", "自発接客見送り", "拒否", "サーバー失敗", "本文の途中失敗", "応答未接続"],
)
async def test_HTTPの失敗段階によらず受信した要求IDと卓を記録し本文を漏らさない(
    caplog: pytest.LogCaptureFixture,
    config: VoiceConfiguration,
    outcome: str,
    phase: str,
    status: int | None,
):
    caplog.set_level(logging.INFO, logger="tablecast.voice")

    async def response(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/config"):
            return httpx.Response(
                200, headers={"X-Request-Id": "tablecast-config"}, json=config.model_dump()
            )
        if status is None:
            raise httpx.ConnectError("tablecast-private-connection-error")
        headers = {"X-Request-Id": "tablecast-turn", "content-type": "text/plain"}
        if outcome == "stream_error":
            return httpx.Response(status, headers=headers, stream=BrokenStream())
        return httpx.Response(status, headers=headers, text="tablecast-private-body")

    async with httpx.AsyncClient(
        base_url="https://tablecast.test",
        headers={"Authorization": "Bearer tablecast-private-token"},
        transport=httpx.MockTransport(response),
    ) as client:
        api = VoiceAPI(client, config.voiceSessionId)
        await api.configuration()

        async def read() -> list[str]:
            return [
                part
                async for part in api.stream_turn(
                    "tablecast-turn-id",
                    "ja",
                    [{"role": "user", "content": "tablecast-private-input"}],
                    trigger="proactive" if outcome == "skipped" else "user",
                )
            ]

        if outcome == "success":
            assert await read() == ["tablecast-private-body"]
        else:
            error = (
                TurnSkipped
                if outcome == "skipped"
                else httpx.HTTPStatusError
                if outcome in ("rejected", "server_error")
                else httpx.RequestError
            )
            with pytest.raises(error):
                await read()

    configuration_log, turn_log = records(caplog, "tablecast.voice_http")
    assert configuration_log["requestId"] == "tablecast-config"
    assert configuration_log["tableSessionId"] == config.tableSessionId
    assert (
        turn_log.items()
        >= {
            "operation": "turn",
            "phase": phase,
            "httpStatus": status,
            "requestId": "tablecast-turn" if status is not None else None,
            "tableSessionId": config.tableSessionId,
            "voiceSessionId": config.voiceSessionId,
            "releaseSha": config.releaseSha,
            "turnId": "tablecast-turn-id",
        }.items()
    )
    assert_private(caplog)


class WaitingStream(httpx.AsyncByteStream):
    def __init__(self) -> None:
        self.waiting = asyncio.Event()
        self.closed = False

    async def __aiter__(self):
        yield b"tablecast-private-output"
        self.waiting.set()
        await asyncio.Event().wait()

    async def aclose(self) -> None:
        self.closed = True


async def test_HTTP取消は受信済み要求IDを保持し接続を閉じる(
    caplog: pytest.LogCaptureFixture,
    config: VoiceConfiguration,
):
    caplog.set_level(logging.INFO, logger="tablecast.voice")
    stream = WaitingStream()

    async def response(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"X-Request-Id": "tablecast-cancel", "content-type": "text/plain"},
            stream=stream,
        )

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        api = VoiceAPI(client, config.voiceSessionId)
        api.config = config

        async def read():
            return [part async for part in api.stream_turn("tablecast-cancel-turn", "ja", [])]

        task = asyncio.create_task(read())
        await asyncio.wait_for(stream.waiting.wait(), timeout=5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert stream.closed
    [entry] = records(caplog, "tablecast.voice_http")
    assert entry["requestId"] == "tablecast-cancel"
    assert entry["turnId"] == "tablecast-cancel-turn"
    assert entry["phase"] == "interrupted"
    assert_private(caplog)


async def test_実Sessionで通常発話と確認読上げと旧turn後処理のIDを混同しない(
    caplog: pytest.LogCaptureFixture,
    config: VoiceConfiguration,
):
    caplog.set_level(logging.INFO, logger="tablecast.voice")
    turns: list[str] = []
    measured: list[LLMMetrics] = []
    old_end_started = asyncio.Event()
    release_old_end = asyncio.Event()
    confirmation_read = asyncio.Event()
    requests: list[httpx.Request] = []

    async def response(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        headers = {"X-Request-Id": f"tablecast-http-{len(requests)}"}
        if request.url.path.endswith("/turns"):
            turns.append(json.loads(request.content)["turnId"])
            return httpx.Response(
                200, headers={**headers, "content-type": "text/plain"}, text="承りました。"
            )
        if request.url.path.endswith("/confirmation"):
            return httpx.Response(
                200,
                headers=headers,
                content=json.dumps(
                    {"id": "tablecast-snapshot", "text": "内容をご確認ください。"}
                    if len(turns) == 1
                    else None
                ).encode(),
            )
        if request.url.path.endswith(f"/{turns[0]}/end"):
            old_end_started.set()
            await release_old_end.wait()
            return httpx.Response(503, headers=headers, text="tablecast-private-provider-error")
        if request.url.path.endswith("/confirmations/read"):
            confirmation_read.set()
        return httpx.Response(200, headers=headers, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, config.voiceSessionId), config)
        assert isinstance(agent.llm, TablecastLLM)
        agent.llm.on("metrics_collected", measured.append)
        session = AgentSession(user_away_timeout=None)
        await session.start(agent, record=False)
        try:
            first = session.generate_reply(user_input="注文をお願いします。")
            await asyncio.wait_for(first, timeout=5)
            await asyncio.wait_for(old_end_started.wait(), timeout=5)
            await asyncio.wait_for(confirmation_read.wait(), timeout=5)
            second = session.generate_reply(user_input="追加をお願いします。")
            await asyncio.wait_for(second, timeout=5)
            assert len(turns) == 2
            release_old_end.set()
            await asyncio.gather(*agent.tasks, return_exceptions=True)
        finally:
            release_old_end.set()
            await session.aclose()
            await agent.close()
    starts = [
        entry for entry in records(caplog, "tablecast.voice_turn") if entry["phase"] == "started"
    ]
    assert [entry["turnId"] for entry in starts] == turns
    assert [entry["speechId"] for entry in starts] == [first.id, second.id]
    assert {entry["sdkRequestId"] for entry in starts} == {metric.request_id for metric in measured}
    assert len(measured) == 2
    assert all(
        entry["tableSessionId"] == config.tableSessionId
        and entry["releaseSha"] == config.releaseSha
        for entry in starts
    )
    [old_failure] = [
        entry
        for entry in records(caplog, "tablecast.voice_background")
        if entry["operation"] == "end_turn"
    ]
    assert old_failure["turnId"] == turns[0]
    assert old_failure["sdkRequestId"] == starts[0]["sdkRequestId"]
    assert old_failure["speechId"] == first.id
    assert old_failure["phase"] == "failed"
    confirmation = [
        entry
        for entry in records(caplog, "tablecast.voice_speech")
        if entry["operation"] == "confirmation_playback"
    ]
    assert [entry["phase"] for entry in confirmation] == ["started", "completed"]
    assert all(
        entry["turnId"] == turns[0] and entry["speechId"] not in (first.id, second.id)
        for entry in confirmation
    )
    [read_log] = [
        entry
        for entry in records(caplog, "tablecast.voice_http")
        if entry["operation"] == "confirmation_read"
    ]
    assert read_log["speechId"] == confirmation[0]["speechId"]
    assert read_log["turnId"] == turns[0]
    for index, request in enumerate(requests, start=1):
        [entry] = [
            entry
            for entry in records(caplog, "tablecast.voice_http")
            if entry["requestId"] == f"tablecast-http-{index}"
        ]
        if request.url.path.endswith("/turns"):
            assert entry["turnId"] == json.loads(request.content)["turnId"]
    assert_private(caplog)


@pytest.mark.parametrize("stream_error", [False, True], ids=["本文前の拒否", "本文の途中失敗"])
async def test_実Sessionで失敗metricsがなくてもturnを追跡でき秘密の例外本文をSDKへ渡さない(
    caplog: pytest.LogCaptureFixture,
    config: VoiceConfiguration,
    stream_error: bool,
):
    caplog.set_level(logging.INFO, logger="tablecast.voice")
    measured: list[LLMMetrics] = []
    failures: list[llm.LLMError] = []

    async def response(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/turns"):
            if stream_error:
                return httpx.Response(
                    200,
                    headers={"X-Request-Id": "tablecast-failed", "content-type": "text/plain"},
                    stream=BrokenStream(),
                )
            return httpx.Response(
                503,
                headers={"X-Request-Id": "tablecast-failed"},
                text="tablecast-private-provider-error",
            )
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(response)
    ) as client:
        agent = TablecastAgent(VoiceAPI(client, config.voiceSessionId), config)
        assert isinstance(agent.llm, TablecastLLM)
        agent.llm.on("metrics_collected", measured.append)
        agent.llm.on("error", failures.append)
        session = AgentSession(user_away_timeout=None)
        await session.start(agent, record=False)
        try:
            speech = session.generate_reply(user_input="tablecast-private-input")
            await asyncio.wait_for(speech, timeout=5)
            assert speech.exception() is not None
            await asyncio.gather(*agent.tasks, return_exceptions=True)
        finally:
            await session.aclose()
            await agent.close()
    [started, ended] = records(caplog, "tablecast.voice_turn")
    assert measured == []
    [failure] = failures
    assert failure.recoverable is False
    assert str(failure.error) == "音声APIの応答生成に失敗しました"
    assert started["sdkRequestId"] == ended["sdkRequestId"]
    assert started["sdkRequestId"]
    assert started["speechId"] == speech.id
    assert ended["phase"] == "failed"
    [http_log] = [
        entry for entry in records(caplog, "tablecast.voice_http") if entry["operation"] == "turn"
    ]
    assert http_log["requestId"] == "tablecast-failed"
    assert http_log["turnId"] == started["turnId"]
    assert_private(caplog)
