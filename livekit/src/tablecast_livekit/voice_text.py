"""音声処理を待たせず、認可済み端末へ短い表示更新を配信する。"""

import asyncio
import json
import logging
from collections.abc import Callable
from typing import Literal, NotRequired, TypedDict

from livekit import rtc

logger = logging.getLogger("tablecast.voice")


class TranscriptSpeaker(TypedDict):
    id: str
    streamId: str


class UserText(TypedDict):
    type: Literal["user"]
    id: str
    text: str
    final: bool
    turnId: NotRequired[str]
    speaker: NotRequired[TranscriptSpeaker]


class AssistantText(TypedDict):
    type: Literal["assistant"]
    turnId: str
    text: str
    rawText: str
    final: bool


class InterruptedText(TypedDict):
    type: Literal["interrupted"]
    turnId: str


class TextError(TypedDict):
    type: Literal["error"]
    turnId: str
    code: Literal["VOICE_TEXT_TOO_LARGE", "VOICE_RESPONSE_FAILED"]


type VoiceText = UserText | AssistantText | InterruptedText | TextError


class VoiceTextPublisher:
    """累積本文は80msごとに合流し、停止・旧turn・送信滞留を境界で抑える。"""

    def __init__(
        self,
        participant: rtc.LocalParticipant,
        destination: str,
        active: Callable[[], bool],
    ) -> None:
        self.participant = participant
        self.destination = destination
        self.active = active
        self.turn_id: str | None = None
        self.blocked_turn: str | None = None
        self.pending: dict[tuple[str, str], VoiceText] = {}
        self.ready = asyncio.Event()
        self.stopped = False
        self.task = asyncio.create_task(self._run())

    def begin_turn(self, turn_id: str) -> None:
        if self.turn_id is not None:
            self.pending.pop(("assistant", self.turn_id), None)
        self.turn_id = turn_id
        self.blocked_turn = None

    def send(self, message: VoiceText) -> None:
        if self.stopped or not self.active():
            return
        if message["type"] == "assistant" and (
            message["turnId"] != self.turn_id or message["turnId"] == self.blocked_turn
        ):
            return
        key = (
            ("user", message["id"])
            if message["type"] == "user"
            else ("assistant", message["turnId"])
        )
        # 通信が滞留しても音声を待たせない。確定履歴はHTTPで回収する。
        if key not in self.pending and len(self.pending) >= 64:
            self.pending.pop(next(iter(self.pending)))
        self.pending[key] = message
        self.ready.set()

    def interrupt(self, turn_id: str) -> None:
        if self.turn_id == turn_id:
            self.blocked_turn = turn_id
        self.send({"type": "interrupted", "turnId": turn_id})

    def stop(self) -> None:
        self.stopped = True
        self.pending.clear()
        self.task.cancel()

    async def aclose(self) -> None:
        self.stop()
        await asyncio.gather(self.task, return_exceptions=True)

    async def _run(self) -> None:
        while True:
            await self.ready.wait()
            await asyncio.sleep(0.08)
            self.ready.clear()
            messages = list(self.pending.values())
            self.pending.clear()
            for message in messages:
                if self.stopped or not self.active():
                    return
                if message["type"] == "assistant" and (
                    message["turnId"] != self.turn_id or message["turnId"] == self.blocked_turn
                ):
                    continue
                encoded = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode(
                    "utf8"
                )
                # reliable dataの上限15KiBを超えた本文を、完全版として切り詰めない。
                if len(encoded) > 15 * 1024:
                    if message["type"] == "assistant":
                        self.blocked_turn = message["turnId"]
                        encoded = json.dumps(
                            {
                                "type": "error",
                                "turnId": message["turnId"],
                                "code": "VOICE_TEXT_TOO_LARGE",
                            }
                        ).encode("utf8")
                    else:
                        logger.warning("tablecast.voice_text_too_large")
                        continue
                try:
                    await self.participant.publish_data(
                        encoded,
                        reliable=True,
                        topic="tablecast.voice",
                        destination_identities=[self.destination],
                    )
                except Exception:
                    # providerや接続例外の本文・会話文はログへ出さない。
                    logger.warning("tablecast.voice_text_delivery_failed")
