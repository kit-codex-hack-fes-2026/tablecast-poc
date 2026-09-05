"""公式STTの公開フィールドだけを匿名の参考情報へ変換する。"""

from typing import TypedDict

from livekit.agents import stt
from livekit.agents.utils import is_given


class SpeakerWord(TypedDict):
    text: str
    speakerId: str | None
    startTime: float | None
    endTime: float | None


class SpeakerReference(TypedDict):
    id: str | None
    streamId: str
    words: list[SpeakerWord]


def speaker_reference(event: stt.SpeechEvent) -> SpeakerReference | None:
    if event.type != stt.SpeechEventType.FINAL_TRANSCRIPT or not event.alternatives:
        return None
    speech = event.alternatives[0]
    if speech.speaker_id is None and not speech.words:
        return None
    return {
        "id": speech.speaker_id,
        "streamId": event.request_id,
        "words": [
            {
                "text": str(word),
                "speakerId": word.speaker_id,
                "startTime": word.start_time if is_given(word.start_time) else None,
                "endTime": word.end_time if is_given(word.end_time) else None,
            }
            for word in speech.words or []
        ],
    }
