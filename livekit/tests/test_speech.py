"""演技書式と字幕の境界を検証する。"""

import pytest
from livekit.agents.types import TimedString

from tablecast_livekit.speech import CaptionFormatter, caption, captions

TAGGED_SENTENCE = '[warm and calm]はい。<break time="250ms" />二杯ですね。[reset]'


@pytest.mark.parametrize(
    "split", range(1, len(TAGGED_SENTENCE)), ids=lambda value: f"分割位置{value}"
)
def test_タグが任意の位置で分断されても日本語字幕へ漏れない(split):
    formatter = CaptionFormatter()
    result = formatter.push(TAGGED_SENTENCE[:split]) + formatter.push(TAGGED_SENTENCE[split:])
    formatter.finish()
    assert result == "はい。二杯ですね。"


def test_生成音声は閉じたタグだけをそのまま受け取る():
    formatter = CaptionFormatter(preserve_markup=True)
    assert formatter.push("[warm") == ""
    assert formatter.push(" and calm]はい。") == "[warm and calm]はい。"
    formatter.finish()


@pytest.mark.parametrize(
    "source",
    ["[未知]本文", "<emotion>本文", '<break time="11s" />', "[" + "a" * 512],
    ids=["日本語指示", "未知XML", "長すぎる休止", "長すぎるタグ"],
)
def test_不正な演技書式では発話を中断する(source):
    with pytest.raises(ValueError):
        caption(source)


def test_閉じ忘れたタグ断片は表示せず終了時に失敗する():
    formatter = CaptionFormatter()
    assert formatter.push("はい。[warm") == "はい。"
    with pytest.raises(ValueError):
        formatter.finish()


async def test_字幕整形で公開単語時刻と話者ゼロを保持する():
    async def chunks():
        yield TimedString("[warm]はい。", start_time=0.0, end_time=0.5, speaker_id="0")

    result = [value async for value in captions(chunks())]
    assert len(result) == 1
    assert result[0] == "はい。"
    assert isinstance(result[0], TimedString)
    assert result[0].start_time == 0.0
    assert result[0].end_time == 0.5
    assert result[0].speaker_id == "0"


def test_中断済みの文脈では未再生のタグ断片を履歴へ載せない():
    assert caption("はい。[warm", interrupted=True) == "はい。"
