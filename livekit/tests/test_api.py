"""外部モデルを呼ばずにHTTP streamの接続契約を検証する。"""

import asyncio
import json

import httpx
import pytest

from tablecast_livekit.api import VoiceAPI


class FragmentedStream(httpx.AsyncByteStream):
    def __init__(self, *, wait_after_first: bool = False):
        self.closed = False
        self.wait_after_first = wait_after_first
        self.waiting = asyncio.Event()

    async def __aiter__(self):
        payload = "はい、二杯ですね。".encode()
        for byte in payload:
            yield bytes([byte])
        if self.wait_after_first:
            self.waiting.set()
            await asyncio.Event().wait()

    async def aclose(self):
        self.closed = True


async def test_HTTPの一バイト分割でも日本語を壊さずAPI契約を送信する():
    stream = FragmentedStream()
    requests = []

    async def handle(request):
        requests.append(request)
        return httpx.Response(
            200, headers={"content-type": "text/plain; charset=utf-8"}, stream=stream
        )

    async with httpx.AsyncClient(
        base_url="https://tablecast.test",
        headers={"Authorization": "Bearer tablecast-test-token"},
        transport=httpx.MockTransport(handle),
    ) as client:
        api = VoiceAPI(client, "tablecast-voice-1")
        result = [
            part
            async for part in api.stream_turn("turn-1", "ja", [{"role": "user", "content": "二杯"}])
        ]
    assert "".join(result) == "はい、二杯ですね。"
    assert json.loads(requests[0].content)["voiceSessionId"] == "tablecast-voice-1"
    assert requests[0].headers["authorization"] == "Bearer tablecast-test-token"
    assert stream.closed


async def test_音声生成を取り消すとHTTP接続を閉じて再要求しない():
    stream = FragmentedStream(wait_after_first=True)
    requests = []

    async def handle(request):
        requests.append(request)
        return httpx.Response(200, headers={"content-type": "text/plain"}, stream=stream)

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(handle)
    ) as client:
        api = VoiceAPI(client, "tablecast-voice-1")

        async def read():
            return [
                part
                async for part in api.stream_turn(
                    "turn-1", "ja", [{"role": "user", "content": "二杯"}]
                )
            ]

        task = asyncio.create_task(read())
        await stream.waiting.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert stream.closed
    assert len(requests) == 1


async def test_停止済みセッションの拒否を通常応答へ変換しない():
    async def handle(request):
        return httpx.Response(409, json={"error": {"code": "VOICE_STOPPED"}})

    async with httpx.AsyncClient(
        base_url="https://tablecast.test", transport=httpx.MockTransport(handle)
    ) as client:
        api = VoiceAPI(client, "tablecast-old-voice")
        with pytest.raises(httpx.HTTPStatusError):
            _ = [
                part
                async for part in api.stream_turn(
                    "turn-1", "ja", [{"role": "user", "content": "はい"}]
                )
            ]
