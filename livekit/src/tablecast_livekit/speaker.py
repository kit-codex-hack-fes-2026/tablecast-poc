"""公式STTの公開フィールドだけを匿名の参考情報へ変換する。"""

from collections import Counter
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
    # 未識別語は投票せず、最多が同数なら発話全体の話者は決めない。
    votes = Counter(word.speaker_id for word in speech.words or [] if word.speaker_id is not None)
    ranking = votes.most_common(2)
    speaker_id = speech.speaker_id
    if ranking:
        speaker_id = ranking[0][0] if len(ranking) == 1 or ranking[0][1] > ranking[1][1] else None
    return {
        "id": speaker_id,
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
