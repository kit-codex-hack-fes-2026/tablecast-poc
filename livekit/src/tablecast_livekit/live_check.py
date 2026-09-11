"""明示的に実行する有料GPT-Liveの起動・発話試験。Room・業務は別途検証する。"""

import asyncio
import json
import os

from livekit import rtc
from livekit.agents import Agent, AgentSession, llm
from livekit.agents.voice import io
from livekit.plugins.openai.realtime import GPTLiveModel


class SilenceInput(io.AudioInput):
    def __init__(self) -> None:
        super().__init__(label="tablecast-paid-check")

    async def __anext__(self) -> rtc.AudioFrame:
        await asyncio.sleep(0.02)
        return rtc.AudioFrame.create(sample_rate=24000, num_channels=1, samples_per_channel=480)


async def check_language(language: str) -> dict[str, object]:
    model = GPTLiveModel(model="gpt-live-1", voice="marin", delegation="client")
    session = AgentSession()
    session.input.audio = SilenceInput()
    try:
        async with asyncio.timeout(45):
            await session.start(
                agent=Agent(
                    instructions=f"あなたは飲食店の接客AIです。{language}で短く挨拶してください。",
                    llm=model,
                )
            )
            speech = session.generate_reply(instructions=f"今すぐ{language}で挨拶してください。")
            await speech
            error = speech.exception()
            if error is not None:
                raise error
            reply = "".join(
                item.text_content or ""
                for item in speech.chat_items
                if isinstance(item, llm.ChatMessage)
            )
            if not reply.strip():
                raise RuntimeError("GPT-Liveの発話字幕を取得できませんでした")
            return {"model": "gpt-live-1", "language": language, "reply": reply}
    finally:
        await session.aclose()
        await model.aclose()


async def run() -> None:
    for language in ["日本語", "British English"]:
        print(json.dumps(await check_language(language), ensure_ascii=False))


def main() -> None:
    if os.environ.get("TABLECAST_RUN_PAID_VOICE_TESTS") != "1":
        raise SystemExit("有料試験です。TABLECAST_RUN_PAID_VOICE_TESTS=1 を明示してください。")
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEYとGPT-Liveの利用権限が必要です。")
    asyncio.run(run())
