"""認証済みの音声HTTP境界。再試行で業務操作を重複させない。"""

import asyncio
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict

from .speaker import SpeakerReference

logger = logging.getLogger("tablecast.voice")


class VoiceConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voiceSessionId: str
    tableSessionId: str
    participantIdentity: str
    locale: Literal["ja", "en"]
    voice: str
    releaseSha: str
    proactive: bool


class TurnSkipped(Exception):
    """APIが現在の卓に自発接客を開始しないと判断した。"""


class Confirmation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    text: str


class VoiceAPI:
    def __init__(self, client: httpx.AsyncClient, voice_session_id: str) -> None:
        self.client = client
        self.voice_session_id = voice_session_id
        self.config: VoiceConfiguration | None = None

    @asynccontextmanager
    async def _request(
        self,
        operation: str,
        method: str,
        path: str,
        *,
        turn_id: str | None = None,
        speech_id: str | None = None,
        params: dict[str, str] | None = None,
        json: dict[str, object] | None = None,
    ) -> AsyncIterator[httpx.Response]:
        trace_id: str | None = None
        http_status: int | None = None
        phase = "failed"
        try:
            async with self.client.stream(method, path, params=params, json=json) as response:
                # 拒否や本文の途中失敗でも、受信済みの診断IDを失わない。
                trace_id = response.headers.get("X-Request-Id")
                http_status = response.status_code
                response.raise_for_status()
                yield response
                phase = "completed"
        except TurnSkipped:
            phase = "skipped"
            raise
        except (asyncio.CancelledError, GeneratorExit):
            phase = "interrupted"
            raise
        except httpx.HTTPStatusError as error:
            phase = "rejected" if error.response.status_code < 500 else "failed"
            raise
        finally:
            logger.info(
                "tablecast.voice_http",
                extra={
                    "event": "tablecast.voice_http",
                    "operation": operation,
                    "phase": phase,
                    "httpStatus": http_status,
                    "traceId": trace_id,
                    "voiceSessionId": self.voice_session_id,
                    "tableSessionId": self.config.tableSessionId if self.config else None,
                    "releaseSha": self.config.releaseSha if self.config else None,
                    "turnId": turn_id,
                    "speechId": speech_id,
                },
            )

    async def configuration(self) -> VoiceConfiguration:
        async with self._request(
            "configuration",
            "GET",
            "/internal/voice/config",
            params={"voiceSessionId": self.voice_session_id},
        ) as response:
            await response.aread()
            self.config = VoiceConfiguration.model_validate(response.json())
            return self.config

    async def stream_turn(
        self,
        turn_id: str,
        locale: str,
        messages: list[dict[str, str]],
        speaker: SpeakerReference | None = None,
        *,
        trigger: Literal["user", "proactive"] = "user",
    ) -> AsyncGenerator[str]:
        # httpxのデコーダーでUTF-8のHTTP境界を吸収し、取消時には接続を閉じる。
        async with self._request(
            "turn",
            "POST",
            "/internal/voice/turns",
            turn_id=turn_id,
            json={
                "turnId": turn_id,
                "voiceSessionId": self.voice_session_id,
                "locale": locale,
                "messages": messages,
                "trigger": trigger,
                **({"speaker": speaker} if speaker is not None else {}),
            },
        ) as response:
            if response.status_code == 204 and trigger == "proactive":
                raise TurnSkipped
            if not response.headers.get("content-type", "").startswith("text/plain"):
                raise ValueError("音声APIの応答形式が不正です")
            async for text in response.aiter_text():
                yield text

    async def end_turn(self, turn_id: str, status: str) -> None:
        async with self._request(
            "end_turn",
            "POST",
            f"/internal/voice/turns/{turn_id}/end",
            turn_id=turn_id,
            json={"voiceSessionId": self.voice_session_id, "status": status},
        ) as response:
            await response.aread()

    async def confirmation(self, turn_id: str) -> Confirmation | None:
        async with self._request(
            "confirmation",
            "GET",
            "/internal/voice/confirmation",
            turn_id=turn_id,
            params={"voiceSessionId": self.voice_session_id, "turnId": turn_id},
        ) as response:
            await response.aread()
            value = response.json()
            return Confirmation.model_validate(value) if value else None

    async def confirmation_read(
        self, turn_id: str, snapshot_id: str, *, speech_id: str | None = None
    ) -> None:
        async with self._request(
            "confirmation_read",
            "POST",
            "/internal/voice/confirmations/read",
            turn_id=turn_id,
            speech_id=speech_id,
            json={
                "voiceSessionId": self.voice_session_id,
                "turnId": turn_id,
                "snapshotId": snapshot_id,
            },
        ) as response:
            await response.aread()

    async def record_played(
        self, turn_id: str, text: str, interrupted: bool, *, speech_id: str | None = None
    ) -> None:
        async with self._request(
            "playback",
            "POST",
            "/internal/voice/playback",
            turn_id=turn_id,
            speech_id=speech_id,
            json={
                "voiceSessionId": self.voice_session_id,
                "turnId": turn_id,
                "text": text,
                "interrupted": interrupted,
            },
        ) as response:
            await response.aread()
