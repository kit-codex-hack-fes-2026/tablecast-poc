"""公式イベントからの参考話者情報だけを検証する。"""

from livekit.agents import LanguageCode, stt
from livekit.agents.types import TimedString

from tablecast_livekit.speaker import speaker_reference


def test_話者ゼロと未帰属語と欠損時刻を区別する():
    event = stt.SpeechEvent(
        type=stt.SpeechEventType.FINAL_TRANSCRIPT,
        request_id="tablecast-stream-1",
        alternatives=[
            stt.SpeechData(
                language=LanguageCode("ja-JP"),
                text="二杯です",
                words=[
                    TimedString("二杯", start_time=0.0, end_time=0.4, speaker_id="0"),
                    TimedString("です"),
                ],
            )
        ],
    )
    result = speaker_reference(event)
    assert result is not None
    assert result["id"] is None
    assert result["words"][0]["speakerId"] == "0"
    assert result["words"][0]["startTime"] == 0.0
    assert result["words"][1]["speakerId"] is None
    assert result["words"][1]["startTime"] is None


def test_認識候補を別話者として増やさない():
    event = stt.SpeechEvent(
        type=stt.SpeechEventType.FINAL_TRANSCRIPT,
        alternatives=[
            stt.SpeechData(language=LanguageCode("en-GB"), text="Two teas", speaker_id="0"),
            stt.SpeechData(language=LanguageCode("en-GB"), text="To tease", speaker_id="1"),
        ],
    )
    result = speaker_reference(event)
    assert result is not None
    assert result["id"] == "0"


def test_暫定発話と欠損情報に架空の話者を割り当てない():
    assert speaker_reference(stt.SpeechEvent(type=stt.SpeechEventType.INTERIM_TRANSCRIPT)) is None
    assert (
        speaker_reference(
            stt.SpeechEvent(
                type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[stt.SpeechData(language=LanguageCode("ja"), text="はい")],
            )
        )
        is None
    )
