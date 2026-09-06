"""明示的に実行する有料STT/TTS接続試験。音声はメモリ内だけで扱う。"""

import asyncio
import json
import os
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from livekit.agents import APIConnectOptions, stt
from livekit.plugins import inworld


async def check_language(language: str, voice: str, text: str) -> dict[str, object]:
    async with aiohttp.ClientSession() as http:
        recognizer = inworld.STT(language=language, enable_voice_profile=False, http_session=http)
        synthesizer = inworld.TTS(
            model="inworld-tts-2", voice=voice, language=language, http_session=http
        )
        options = APIConnectOptions(max_retry=0, timeout=20)
        stream = recognizer.stream(conn_options=options)
        transcripts: list[str] = []
        duration = 0.0

        async def receive() -> None:
            async for event in stream:
                if event.type == stt.SpeechEventType.FINAL_TRANSCRIPT and event.alternatives:
                    transcripts.append(event.alternatives[0].text)
                    # 疎通は確定認識で完了し、サーバーのWebSocket切断を待たない。
                    return

        receive_task = asyncio.create_task(receive())
        try:
            async with asyncio.timeout(45):
                async with synthesizer.synthesize(text, conn_options=options) as speech:
                    async for packet in speech:
                        duration += packet.frame.duration
                        stream.push_frame(packet.frame)
                stream.end_input()
                await receive_task
            if duration <= 0 or not any(transcripts):
                raise RuntimeError("合成音声または確定した認識結果を取得できませんでした")
            return {"language": language, "audioSeconds": duration, "transcripts": transcripts}
        finally:
            receive_task.cancel()
            await asyncio.gather(receive_task, return_exceptions=True)
            await stream.aclose()
            await recognizer.aclose()
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
    load_dotenv(Path(__file__).resolve().parents[3] / ".env.secrets.local")
    required = ["INWORLD_API_KEY", "TABLECAST_INWORLD_VOICE_JA", "TABLECAST_INWORLD_VOICE_EN"]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit("未設定の環境変数: " + ", ".join(missing))
    asyncio.run(run())
