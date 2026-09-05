"""認証済みの音声HTTP境界。再試行で業務操作を重複させない。"""

from collections.abc import AsyncIterator
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict

from .speaker import SpeakerReference


class VoiceConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    voiceSessionId: str
    tableSessionId: str
    participantIdentity: str
    locale: Literal["ja", "en"]
    voice: str
    releaseSha: str


class Confirmation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    text: str


class VoiceAPI:
    def __init__(self, client: httpx.AsyncClient, voice_session_id: str) -> None:
        self.client = client
        self.voice_session_id = voice_session_id

    async def configuration(self) -> VoiceConfiguration:
        response = await self.client.get(
            "/internal/voice/config", params={"voiceSessionId": self.voice_session_id}
        )
        response.raise_for_status()
        return VoiceConfiguration.model_validate(response.json())

    async def stream_turn(
        self,
        turn_id: str,
        locale: str,
        messages: list[dict[str, str]],
        speaker: SpeakerReference | None = None,
    ) -> AsyncIterator[str]:
        # httpxのデコーダーでUTF-8のHTTP境界を吸収し、取消時には接続を閉じる。
        async with self.client.stream(
            "POST",
            "/internal/voice/turns",
            json={
                "turnId": turn_id,
                "voiceSessionId": self.voice_session_id,
                "locale": locale,
                "messages": messages,
                **({"speaker": speaker} if speaker is not None else {}),
            },
        ) as response:
            response.raise_for_status()
            if not response.headers.get("content-type", "").startswith("text/plain"):
                raise ValueError("音声APIの応答形式が不正です")
            async for text in response.aiter_text():
                yield text

    async def end_turn(self, turn_id: str, status: str) -> None:
        response = await self.client.post(
            f"/internal/voice/turns/{turn_id}/end",
            json={"voiceSessionId": self.voice_session_id, "status": status},
        )
        response.raise_for_status()

    async def confirmation(self, turn_id: str) -> Confirmation | None:
        response = await self.client.get(
            "/internal/voice/confirmation",
            params={"voiceSessionId": self.voice_session_id, "turnId": turn_id},
        )
        response.raise_for_status()
        value = response.json()
        return Confirmation.model_validate(value) if value else None

    async def confirmation_read(self, turn_id: str, snapshot_id: str) -> None:
        response = await self.client.post(
            "/internal/voice/confirmations/read",
            json={
                "voiceSessionId": self.voice_session_id,
                "turnId": turn_id,
                "snapshotId": snapshot_id,
            },
        )
        response.raise_for_status()

    async def record_played(self, turn_id: str, text: str, interrupted: bool) -> None:
        response = await self.client.post(
            "/internal/voice/playback",
            json={
                "voiceSessionId": self.voice_session_id,
                "turnId": turn_id,
                "text": text,
                "interrupted": interrupted,
            },
        )
        response.raise_for_status()
