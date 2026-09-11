"""明示的に実行する有料Realtime/TTS疎通試験。音声はメモリ内だけで扱う。"""

import asyncio
import json
import os

import aiohttp
from livekit.agents import APIConnectOptions
from livekit.plugins import inworld, openai


async def check_language(language: str, voice: str, text: str) -> dict[str, object]:
    async with aiohttp.ClientSession() as http:
        model = openai.realtime.RealtimeModel(
            model="gpt-realtime-2.1",
            modalities=["text"],
            turn_detection=None,
            api_key=os.environ["TABLECAST_MODEL_API_KEY"],
            http_session=http,
            input_audio_transcription=None,
        )
        realtime = model.session()
        synthesizer = inworld.TTS(
            model="inworld-tts-2", voice=voice, language=language, http_session=http
        )
        options = APIConnectOptions(max_retry=0, timeout=20)
        duration = 0.0
        reply = ""
        try:
            async with asyncio.timeout(60):
                await realtime.update_instructions(
                    "音声で受けた注文の商品と数量を同じ言語で短く復唱してください。"
                    "注文は送信せず、本文だけを返してください。"
                )
                async with synthesizer.synthesize(text, conn_options=options) as speech:
                    async for packet in speech:
                        realtime.push_audio(packet.frame)
                realtime.commit_audio()
                generation = await realtime.generate_reply()
                async for message in generation.message_stream:
                    async for chunk in message.text_stream:
                        reply += chunk
                if not reply.strip():
                    raise RuntimeError("Realtimeから応答を取得できませんでした")
                async with synthesizer.synthesize(reply, conn_options=options) as speech:
                    async for packet in speech:
                        if any(packet.frame.data):
                            duration += packet.frame.duration
            if duration <= 0:
                raise RuntimeError("Inworldから有声の応答を取得できませんでした")
            return {
                "model": "gpt-realtime-2.1",
                "language": language,
                "reply": reply,
                "audioSeconds": duration,
            }
        finally:
            await realtime.aclose()
            await model.aclose()
            await synthesizer.aclose()


async def run() -> None:
    samples = [
        ("ja-JP", os.environ["TABLECAST_INWORLD_VOICE_JA"], "ほうじ茶を二杯お願いします。"),
        ("en-GB", os.environ["TABLECAST_INWORLD_VOICE_EN"], "Two roasted green teas, please."),
    ]
    for language, voice, text in samples:
        print(json.dumps(await check_language(language, voice, text), ensure_ascii=False))


def main() -> None:
    if os.environ.get("TABLECAST_RUN_PAID_VOICE_TESTS") != "1":
        raise SystemExit(
            "有料試験です。TABLECAST_RUN_PAID_VOICE_TESTS=1 を明示して実行してください。"
        )
    required = [
        "INWORLD_API_KEY",
        "TABLECAST_MODEL_API_KEY",
        "TABLECAST_INWORLD_VOICE_JA",
        "TABLECAST_INWORLD_VOICE_EN",
    ]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit("未設定の環境変数: " + ", ".join(missing))
    asyncio.run(run())
