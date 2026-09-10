"""認証済みの音声HTTP境界。再試行で業務操作を重複させない。"""

import asyncio
import json as json_module
import logging
import sys
import time
import traceback
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from opentelemetry import trace
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from pydantic import BaseModel, ConfigDict, Field

from .speaker import SpeakerReference
from .telemetry import capture_content, safe_content

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
    speechSpeed: float = Field(default=1.0, ge=0.5, le=1.5, multiple_of=0.1)


class RealtimeMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str
    interrupted: bool = False


class RealtimeConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: Literal["gpt-realtime-2.1"]
    instructions: str
    tools: list[dict[str, object]]
    history: list[RealtimeMessage] = Field(default_factory=list)


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
        attributes: dict[str, str] = {
            "tablecast.voice.session.id": self.voice_session_id,
            "tablecast.operation": operation,
            "http.request.method": method,
        }
        if turn_id:
            attributes["tablecast.voice.turn.id"] = turn_id
        if speech_id:
            attributes["lk.speech_id"] = speech_id
        with trace.get_tracer("tablecast").start_as_current_span(
            "tablecast.voice.api",
            attributes=attributes,
            record_exception=False,
            set_status_on_exception=False,
        ) as span:
            request_id: str | None = None
            http_status: int | None = None
            phase = "failed"
            started = time.perf_counter()
            headers: dict[str, str] = {}
            TraceContextTextMapPropagator().inject(headers)
            if capture_content() and json is not None:
                span.set_attribute("lk.pii.input", json_module.dumps(safe_content(json)))
            try:
                async with self.client.stream(
                    method, path, params=params, json=json, headers=headers
                ) as response:
                    # 拒否や本文の途中失敗でも、受信済みの診断IDを失わない。
                    request_id = response.headers.get("X-Request-Id")
                    http_status = response.status_code
                    if response.is_error:
                        await response.aread()
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
                error = sys.exception()
                if capture_content() and error is not None:
                    span.add_event(
                        "exception",
                        {
                            "exception.type": type(error).__name__,
                            "exception.message": safe_content(str(error)),
                            "exception.stacktrace": safe_content(
                                "".join(traceback.format_exception(error))
                            ),
                        },
                    )
                span.set_attributes(
                    {
                        "tablecast.outcome": phase,
                        "tablecast.duration_ms": (time.perf_counter() - started) * 1000,
                    }
                )
                if request_id:
                    span.set_attribute("tablecast.request.id", request_id)
                if http_status is not None:
                    span.set_attribute("http.response.status_code", http_status)
                if phase == "failed":
                    span.set_status(trace.StatusCode.ERROR)
                logger.info(
                    "tablecast.voice_http",
                    extra={
                        "event": "tablecast.voice_http",
                        "operation": operation,
                        "phase": phase,
                        "httpStatus": http_status,
                        "requestId": request_id,
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

    async def realtime_configuration(self) -> RealtimeConfiguration:
        async with self._request(
            "realtime",
            "GET",
            "/internal/voice/realtime",
            params={"voiceSessionId": self.voice_session_id},
        ) as response:
            await response.aread()
            return RealtimeConfiguration.model_validate(response.json())

    async def start_turn(self, turn_id: str, locale: str, *, proactive: bool = False) -> None:
        async with self._request(
            "start_turn",
            "POST",
            "/internal/voice/turns",
            turn_id=turn_id,
            json={
                "voiceSessionId": self.voice_session_id,
                "turnId": turn_id,
                "locale": locale,
                "transport": "realtime",
                "trigger": "proactive" if proactive else "user",
                "messages": [] if proactive else [{"role": "user", "content": ""}],
            },
        ) as response:
            await response.aread()
            if response.status_code == 204:
                raise TurnSkipped

    async def tool(
        self, turn_id: str, name: str, call_id: str, arguments: dict[str, object]
    ) -> object:
        async with self._request(
            "tool",
            "POST",
            "/internal/voice/tools",
            turn_id=turn_id,
            json={
                "voiceSessionId": self.voice_session_id,
                "turnId": turn_id,
                "toolName": name,
                "toolCallId": call_id,
                "arguments": arguments,
            },
        ) as response:
            await response.aread()
            return response.json()["result"]

    async def transcript(self, turn_id: str, text: str) -> None:
        async with self._request(
            "transcript",
            "POST",
            "/internal/voice/transcript",
            turn_id=turn_id,
            json={"voiceSessionId": self.voice_session_id, "turnId": turn_id, "text": text},
        ) as response:
            await response.aread()

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
