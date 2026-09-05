"""LiveKitの公開nodeと公式Inworldプラグインをつなぐ。"""

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterable, AsyncIterator, Coroutine
from typing import Any
from uuid import uuid4

import httpx
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    ModelSettings,
    TurnHandlingOptions,
    cli,
    llm,
    room_io,
    stt,
)
from livekit.agents.types import TimedString
from livekit.agents.voice import SpeechHandle
from livekit.plugins import inworld, silero

from .api import VoiceAPI, VoiceConfiguration
from .speaker import SpeakerReference, speaker_reference
from .speech import CaptionFormatter, caption, captions

logger = logging.getLogger("tablecast.voice")
server = AgentServer(port=int(os.environ.get("TABLECAST_AGENT_HEALTH_PORT", "0")))


class TablecastAgent(Agent):
    def __init__(self, api: VoiceAPI, config: VoiceConfiguration) -> None:
        super().__init__(instructions="接客と業務操作は認証済みTableCast APIへ委譲します。")
        self.api = api
        self.config = config
        self.turn_id: str | None = None
        self.tasks: set[asyncio.Task[None]] = set()
        self.stopped = False
        self.speaker: SpeakerReference | None = None

    def background(self, operation: Coroutine[Any, Any, None]) -> None:
        task = asyncio.create_task(operation)
        self.tasks.add(task)

        def completed(done: asyncio.Task[None]) -> None:
            self.tasks.discard(done)
            if not done.cancelled() and done.exception() is not None:
                # 例外本文にプロバイダー応答や秘密情報が含まれる可能性がある。
                logger.error("tablecast_voice_operation_failed")

        task.add_done_callback(completed)

    async def close(self) -> None:
        self.stopped = True
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)

    async def stt_node(
        self, audio: AsyncIterable[rtc.AudioFrame], model_settings: ModelSettings
    ) -> AsyncIterator[stt.SpeechEvent]:
        async for event in Agent.default.stt_node(self, audio, model_settings):
            if self.stopped:
                return
            if event.type == stt.SpeechEventType.START_OF_SPEECH:
                self.speaker = None
            if event.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                self.speaker = speaker_reference(event)
            yield event

    async def llm_node(
        self, chat_ctx: llm.ChatContext, tools: list[llm.Tool], model_settings: ModelSettings
    ) -> AsyncIterator[str]:
        if self.stopped:
            return
        turn_id = str(uuid4())
        self.turn_id = turn_id
        speech = self.session.current_speech
        if speech is not None:
            self.background(self.record_playback(turn_id, speech))
        messages = [
            {
                "role": item.role,
                "content": caption(item.text_content or "", interrupted=item.interrupted)
                if item.role == "assistant"
                else item.text_content or "",
            }
            for item in chat_ctx.items
            if isinstance(item, llm.ChatMessage)
            and item.role in ("user", "assistant")
            and item.text_content
        ][-100:]
        status = "failed"
        formatter = CaptionFormatter(preserve_markup=True)
        first_chunk = True
        try:
            async for text in self.api.stream_turn(
                turn_id, self.config.locale, messages, self.speaker
            ):
                if self.stopped or self.turn_id != turn_id:
                    status = "interrupted"
                    return
                valid = formatter.push(text)
                if valid:
                    yield ("[reset]" if first_chunk else "") + valid
                    first_chunk = False
            formatter.finish()
            status = "completed"
            self.background(self.read_confirmation(turn_id))
        except asyncio.CancelledError:
            status = "interrupted"
            raise
        finally:
            # 取消通知は新turnの状態を上書きしないAPIへ送る。
            self.background(self.api.end_turn(turn_id, status))

    async def record_playback(self, turn_id: str, speech: SpeechHandle) -> None:
        await speech.wait_for_playout()
        if speech.exception() is not None:
            await self.api.end_turn(turn_id, "failed")
        elif speech.interrupted:
            await self.api.end_turn(turn_id, "interrupted")
        for item in speech.chat_items:
            if isinstance(item, llm.ChatMessage) and item.role == "assistant" and item.text_content:
                await self.api.record_played(
                    turn_id,
                    caption(item.text_content, interrupted=item.interrupted),
                    item.interrupted,
                )

    async def read_confirmation(self, turn_id: str) -> None:
        action = await self.api.confirmation(turn_id)
        if not action or self.stopped or self.turn_id != turn_id:
            return
        speech = self.session.say("[reset]" + action.text, allow_interruptions=True)
        await speech.wait_for_playout()
        await self.record_playback(turn_id, speech)
        if (
            speech.exception() is None
            and not speech.interrupted
            and not self.stopped
            and self.turn_id == turn_id
        ):
            await self.api.confirmation_read(turn_id, action.id)

    async def transcription_node(
        self, text: AsyncIterable[str | TimedString], model_settings: ModelSettings
    ) -> AsyncIterator[str | TimedString]:
        async for value in captions(text):
            yield value


@server.rtc_session(agent_name="tablecast-voice")
async def entrypoint(ctx: JobContext) -> None:
    metadata = json.loads(ctx.job.metadata or "{}")
    voice_session_id = metadata.get("voiceSessionId")
    if not isinstance(voice_session_id, str) or not voice_session_id:
        raise ValueError("音声セッションの認証情報がありません")
    client = httpx.AsyncClient(
        base_url=os.environ["TABLECAST_API_URL"],
        headers={"Authorization": f"Bearer {os.environ['TABLECAST_VOICE_API_TOKEN']}"},
        timeout=httpx.Timeout(90, connect=10),
    )
    api = VoiceAPI(client, voice_session_id)
    try:
        config = await api.configuration()
        agent = TablecastAgent(api, config)
        ctx.log_context_fields = {
            "tableSessionId": config.tableSessionId,
            "voiceSessionId": config.voiceSessionId,
            "releaseSha": config.releaseSha,
        }
        language = "ja-JP" if config.locale == "ja" else "en-GB"
        session: AgentSession = AgentSession(
            stt=inworld.STT(language=language, enable_voice_profile=False),
            tts=inworld.TTS(
                model="inworld-tts-2",
                voice=config.voice,
                language=language,
                timestamp_type="WORD",
                delivery_mode="STABLE",
            ),
            vad=silero.VAD.load(),
            turn_handling=TurnHandlingOptions(
                turn_detection="vad",
                preemptive_generation={"enabled": False},
                interruption={"resume_false_interruption": False},
            ),
            use_tts_aligned_transcript=True,
        )

        @ctx.room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
            if participant.identity == config.participantIdentity:
                agent.stopped = True
                session.shutdown(drain=False)

        async def shutdown() -> None:
            await agent.close()
            await session.aclose()
            await client.aclose()

        ctx.add_shutdown_callback(shutdown)
        await session.start(
            agent=agent,
            room=ctx.room,
            room_options=room_io.RoomOptions(
                participant_identity=config.participantIdentity,
                text_input=False,
                audio_input=room_io.AudioInputOptions(pre_connect_audio=False),
                close_on_disconnect=True,
            ),
        )
    except BaseException:
        await client.aclose()
        raise


def main() -> None:
    cli.run_app(server)
