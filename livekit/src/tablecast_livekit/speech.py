"""生成された演技記法だけを字幕から除く。客の原文には適用しない。"""

import re
from collections.abc import AsyncIterable, AsyncIterator

from livekit.agents.types import TimedString

_STEERING = re.compile(r"\[[A-Za-z][A-Za-z0-9 ,.'!?;:()\-/]*\]")
_BREAK = re.compile(r'<break\s+time="(?:\d+(?:\.\d+)?)(?:ms|s)"\s*/>')


class CaptionFormatter:
    """分断されたタグを保持し、閉じた安全な本文だけを返す。"""

    def __init__(self, *, preserve_markup: bool = False) -> None:
        self.pending = ""
        self.preserve_markup = preserve_markup
        self.break_count = 0

    def push(self, chunk: str) -> str:
        output = []
        for character in chunk:
            if self.pending:
                self.pending += character
                if len(self.pending) > 512:
                    raise ValueError("演技記法が長すぎます")
                end = "]" if self.pending.startswith("[") else ">"
                if character == end:
                    if not (_STEERING.fullmatch(self.pending) or _BREAK.fullmatch(self.pending)):
                        raise ValueError("未対応の演技記法です")
                    if self.pending.startswith("<"):
                        self.break_count += 1
                        duration = re.search(r'"([0-9.]+)(ms|s)"', self.pending)
                        if duration is None:
                            raise ValueError("休止時間が不正です")
                        seconds = float(duration[1]) / (1000 if duration[2] == "ms" else 1)
                        if seconds > 10 or self.break_count > 20:
                            raise ValueError("休止指定の上限を超えています")
                    if self.preserve_markup:
                        output.append(self.pending)
                    self.pending = ""
            elif character in "[<":
                self.pending = character
            else:
                output.append(character)
        return "".join(output)

    def finish(self) -> None:
        if self.pending:
            raise ValueError("演技記法が閉じられていません")


def caption(text: str, *, interrupted: bool = False) -> str:
    formatter = CaptionFormatter()
    output = formatter.push(text)
    if not interrupted:
        formatter.finish()
    return output


async def captions(source: AsyncIterable[str | TimedString]) -> AsyncIterator[str | TimedString]:
    formatter = CaptionFormatter()
    async for chunk in source:
        clean = formatter.push(chunk)
        if not clean:
            continue
        if isinstance(chunk, TimedString):
            yield TimedString(
                clean,
                start_time=chunk.start_time,
                end_time=chunk.end_time,
                confidence=chunk.confidence,
                start_time_offset=chunk.start_time_offset,
                speaker_id=chunk.speaker_id,
            )
        else:
            yield clean
    formatter.finish()
