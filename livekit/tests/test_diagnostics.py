"""診断IDの対応と非漏洩をHTTP境界・公開LiveKit Sessionで検証する。"""

import asyncio
import json
import logging

import httpx
import pytest

from tablecast_livekit.api import TurnSkipped, VoiceAPI, VoiceConfiguration


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
