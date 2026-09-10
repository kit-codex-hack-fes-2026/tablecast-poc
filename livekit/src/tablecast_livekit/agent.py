"""LiveKitの公開nodeと公式Inworldプラグインをつなぐ。"""

import asyncio
import json
import logging
import os
from collections.abc import AsyncGenerator, AsyncIterable, AsyncIterator, Coroutine
from contextlib import aclosing
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
    UserStateChangedEvent,
    cli,
    llm,
    room_io,
    stt,
)
from livekit.agents.types import TimedString
from livekit.agents.voice import SpeechHandle
from livekit.plugins import inworld, silero
from pydantic import ValidationError

from .api import TurnSkipped, VoiceAPI, VoiceConfiguration
from .llm import TablecastLLM
from .speaker import SpeakerReference, speaker_reference
from .speech import CaptionFormatter, caption, captions
from .telemetry import configure_telemetry, flush_telemetry, prewarm_telemetry, recording_options
from .voice_text import UserText, VoiceTextPublisher

logger = logging.getLogger("tablecast.voice")
server = AgentServer(
    port=int(os.environ.get("TABLECAST_AGENT_HEALTH_PORT", "0")),
    drain_timeout=600,
    num_idle_processes=1,
    setup_fnc=prewarm_telemetry,
)


class TablecastAgent(Agent):
    def __init__(
        self,
        api: VoiceAPI,
        config: VoiceConfiguration,
        *,
        model: llm.RealtimeModel | None = None,
        chat_ctx: llm.ChatContext | None = None,
        instructions: str = "接客と業務操作は認証済みTableCast APIへ委譲します。",
        tools: list[llm.Tool] | None = None,
    ) -> None:
        super().__init__(
            instructions=instructions,
            chat_ctx=chat_ctx,
            tools=tools,
            llm=model if model is not None else TablecastLLM(self.response),
        )
        self.api = api
        self.config = config
        self.api.config = config
        self.log = logging.LoggerAdapter(
            logger,
            {
                "event": "tablecast.voice_turn",
                "tableSessionId": config.tableSessionId,
                "voiceSessionId": config.voiceSessionId,
                "releaseSha": config.releaseSha,
            },
            merge_extra=True,
        )
        self.turn_id: str | None = None
        self.tasks: set[asyncio.Task[None]] = set()
        self.stopped = False
        self.speaker: SpeakerReference | None = None
        self.proactive_speech: SpeechHandle | None = None
        self.proactive_attempted = False
        self.text_publisher: VoiceTextPublisher | None = None
        self.user_text_id: str | None = None
        self.last_user_text: UserText | None = None

    def user_state_changed(self, event: UserStateChangedEvent) -> None:
        if self.stopped:
            return
        if event.new_state == "speaking":
            self.proactive_attempted = False
            if self.proactive_speech is not None:
                self.proactive_speech.interrupt()
        elif (
            event.new_state == "away"
            and not self.proactive_attempted
            and self.session.agent_state == "listening"
            and (self.session.current_speech is None or self.session.current_speech.done())
        ):
            # 最新設定と業務状態はAPIが判断する。客の発話を会話履歴へ作らない。
            self.proactive_attempted = True
            self.proactive_speech = self.session.generate_reply(allow_interruptions=True)

    def background(
        self,
        operation: Coroutine[Any, Any, None],
        log: logging.LoggerAdapter,
        name: str,
    ) -> None:
        task = asyncio.create_task(operation)
        self.tasks.add(task)

        def completed(done: asyncio.Task[None]) -> None:
            self.tasks.discard(done)
            if done.cancelled():
                log.info(
                    "tablecast.voice_background",
                    extra={
                        "event": "tablecast.voice_background",
                        "operation": name,
                        "phase": "interrupted",
                    },
                )
            elif done.exception() is not None:
                # 例外本文にプロバイダー応答や秘密情報が含まれる可能性がある。
                log.error(
                    "tablecast.voice_background",
                    extra={
                        "event": "tablecast.voice_background",
                        "operation": name,
                        "phase": "failed",
                    },
                )

        task.add_done_callback(completed)

    def stop(self) -> None:
        self.stopped = True
        if self.text_publisher is not None:
            self.text_publisher.stop()

    async def close(self) -> None:
        self.stop()
        if self.proactive_speech is not None:
            self.proactive_speech.interrupt()
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        if self.text_publisher is not None:
            await self.text_publisher.aclose()

    async def sync_configuration(self, synthesizer: inworld.TTS) -> None:
        while not self.stopped:
            await asyncio.sleep(2)
            if self.stopped:
                return
            try:
                async with asyncio.timeout(5):
                    config = await self.api.configuration()
                if self.stopped:
                    return
                if (
                    config.voiceSessionId != self.config.voiceSessionId
                    or config.tableSessionId != self.config.tableSessionId
                    or config.participantIdentity != self.config.participantIdentity
                ):
                    self.stop()
                    self.session.shutdown(drain=False)
                    return
                if config.speechSpeed != self.config.speechSpeed:
                    # 公開update_optionsは次のstreamへ反映し、現在の発話を切らない。
                    synthesizer.update_options(speaking_rate=config.speechSpeed)
                    self.config.speechSpeed = config.speechSpeed
            except httpx.HTTPStatusError as error:
                if error.response.status_code in (401, 403, 409):
                    self.stop()
                    self.session.shutdown(drain=False)
                    return
                self.log.warning("tablecast.voice_configuration_unavailable")
            except (httpx.RequestError, TimeoutError, ValidationError):
                self.log.warning("tablecast.voice_configuration_unavailable")

    async def stt_node(
        self, audio: AsyncIterable[rtc.AudioFrame], model_settings: ModelSettings
    ) -> AsyncIterator[stt.SpeechEvent]:
        async for event in Agent.default.stt_node(self, audio, model_settings):
            if self.stopped:
                return
            if event.type == stt.SpeechEventType.START_OF_SPEECH:
                self.speaker = None
                self.user_text_id = str(uuid4())
            if event.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                self.speaker = speaker_reference(event)
            if (
                event.type
                in (
                    stt.SpeechEventType.INTERIM_TRANSCRIPT,
                    stt.SpeechEventType.FINAL_TRANSCRIPT,
                )
                and event.alternatives
            ):
                speech = event.alternatives[0]
                final = event.type == stt.SpeechEventType.FINAL_TRANSCRIPT
                self.user_text_id = self.user_text_id or str(uuid4())
                message: UserText = {
                    "type": "user",
                    "id": self.user_text_id,
                    "text": speech.text,
                    "final": final,
                }
                speaker_id = self.speaker["id"] if final and self.speaker else speech.speaker_id
                if speaker_id is not None and event.request_id:
                    message["speaker"] = {"id": speaker_id, "streamId": event.request_id}
                if self.text_publisher is not None:
                    self.text_publisher.send(message)
                if final:
                    self.last_user_text = message
                    self.user_text_id = None
            elif event.type == stt.SpeechEventType.END_OF_SPEECH and self.user_text_id is not None:
                # 空finalを伴う雑音では、暫定文を確定発話として残さない。
                if self.text_publisher is not None:
                    self.text_publisher.send(
                        {"type": "user", "id": self.user_text_id, "text": "", "final": True}
                    )
                self.user_text_id = None
            yield event

    async def response(self, chat_ctx: llm.ChatContext, sdk_request_id: str) -> AsyncGenerator[str]:
        if self.stopped:
            return
        turn_id = str(uuid4())
        self.turn_id = turn_id
        if self.text_publisher is not None:
            self.text_publisher.begin_turn(turn_id)
        speech = self.session.current_speech
        # このturnの値を保持する。旧turnの後処理に現在のself.turn_idを使わない。
        log = logging.LoggerAdapter(
            self.log,
            {
                "turnId": turn_id,
                "sdkRequestId": sdk_request_id,
                "speechId": speech.id if speech is not None else None,
                "operation": "turn",
            },
            merge_extra=True,
        )
        log.info("tablecast.voice_turn", extra={"phase": "started"})
        proactive = speech is not None and speech is self.proactive_speech
        if not proactive and self.last_user_text is not None and self.text_publisher is not None:
            self.text_publisher.send({**self.last_user_text, "turnId": turn_id})
            self.last_user_text = None
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
        status: str | None = "failed"
        formatter = CaptionFormatter(preserve_markup=True)
        display_formatter = CaptionFormatter()
        raw_text = ""
        display_text = ""
        try:
            async with aclosing(
                self.api.stream_turn(
                    turn_id,
                    self.config.locale,
                    messages,
                    None if proactive else self.speaker,
                    trigger="proactive" if proactive else "user",
                )
            ) as stream:
                async for text in stream:
                    if self.stopped or self.turn_id != turn_id:
                        status = "interrupted"
                        return
                    valid = formatter.push(text)
                    raw_text += text
                    display_text += display_formatter.push(text)
                    if self.text_publisher is not None:
                        self.text_publisher.send(
                            {
                                "type": "assistant",
                                "turnId": turn_id,
                                "text": display_text,
                                "rawText": raw_text,
                                "final": False,
                            }
                        )
                    if valid:
                        yield valid
            formatter.finish()
            display_formatter.finish()
            status = "completed"
            if self.text_publisher is not None:
                self.text_publisher.send(
                    {
                        "type": "assistant",
                        "turnId": turn_id,
                        "text": display_text,
                        "rawText": raw_text,
                        "final": True,
                    }
                )
            if not proactive:
                self.background(
                    self.read_confirmation(turn_id),
                    logging.LoggerAdapter(self.log, {"turnId": turn_id}, merge_extra=True),
                    "confirmation",
                )
        except TurnSkipped:
            status = None
        except (asyncio.CancelledError, GeneratorExit):
            status = "interrupted"
            raise
        finally:
            if self.text_publisher is not None:
                if status == "interrupted":
                    self.text_publisher.interrupt(turn_id)
                elif status == "failed":
                    self.text_publisher.send(
                        {
                            "type": "error",
                            "turnId": turn_id,
                            "code": "VOICE_RESPONSE_FAILED",
                        }
                    )
            log.info("tablecast.voice_turn", extra={"phase": status or "skipped"})
            # 取消通知は新turnの状態を上書きしないAPIへ送る。
            if status is not None:
                self.background(self.api.end_turn(turn_id, status), log, "end_turn")
                if speech is not None:
                    self.background(self.record_playback(turn_id, speech), log, "playback")

    async def record_playback(
        self, turn_id: str, speech: SpeechHandle, *, confirmation: bool = False
    ) -> None:
        log = logging.LoggerAdapter(
            self.log,
            {
                "event": "tablecast.voice_speech",
                "turnId": turn_id,
                "speechId": speech.id,
                "operation": "confirmation_playback" if confirmation else "playback",
            },
            merge_extra=True,
        )
        phase = "failed"
        log.info("tablecast.voice_speech", extra={"phase": "started"})
        try:
            await speech.wait_for_playout()
            if speech.exception() is not None:
                await self.api.end_turn(turn_id, "failed")
            elif speech.interrupted:
                if self.text_publisher is not None:
                    self.text_publisher.interrupt(turn_id)
                await self.api.end_turn(turn_id, "interrupted")
            for item in speech.chat_items:
                if (
                    isinstance(item, llm.ChatMessage)
                    and item.role == "assistant"
                    and item.text_content
                ):
                    await self.api.record_played(
                        turn_id,
                        caption(item.text_content, interrupted=item.interrupted),
                        item.interrupted,
                        speech_id=speech.id,
                    )
            phase = (
                "failed"
                if speech.exception() is not None
                else "interrupted"
                if speech.interrupted
                else "completed"
            )
        except asyncio.CancelledError:
            phase = "interrupted"
            raise
        finally:
            log.info("tablecast.voice_speech", extra={"phase": phase})

    async def read_confirmation(self, turn_id: str) -> None:
        action = await self.api.confirmation(turn_id)
        if not action or self.stopped or self.turn_id != turn_id:
            return
        speech = self.session.say("[reset]" + action.text, allow_interruptions=True)
        await self.record_playback(turn_id, speech, confirmation=True)
        if (
            speech.exception() is None
            and not speech.interrupted
            and not self.stopped
            and self.turn_id == turn_id
        ):
            await self.api.confirmation_read(turn_id, action.id, speech_id=speech.id)

    async def transcription_node(
        self, text: AsyncIterable[str | TimedString], model_settings: ModelSettings
    ) -> AsyncIterator[str | TimedString]:
        async for value in captions(text):
            yield value


@server.rtc_session(agent_name=os.environ.get("TABLECAST_AGENT_NAME", "tablecast-voice"))
async def entrypoint(ctx: JobContext) -> None:
    metadata = json.loads(ctx.job.metadata or "{}")
    voice_session_id = metadata.get("voiceSessionId")
    if not isinstance(voice_session_id, str) or not voice_session_id:
        raise ValueError("音声セッションの認証情報がありません")
    ctx.log_context_fields = {"voiceSessionId": voice_session_id}
    client = httpx.AsyncClient(
        base_url=os.environ["TABLECAST_API_URL"],
        headers={
            "Authorization": f"Bearer {os.environ['TABLECAST_VOICE_API_TOKEN']}",
            **(
                {
                    "CF-Access-Client-Id": os.environ["CF_ACCESS_CLIENT_ID"],
                    "CF-Access-Client-Secret": os.environ["CF_ACCESS_CLIENT_SECRET"],
                }
                if os.environ.get("CF_ACCESS_CLIENT_ID")
                else {}
            ),
        },
        timeout=httpx.Timeout(90, connect=10),
    )
    api = VoiceAPI(client, voice_session_id)
    try:
        config = await api.configuration()
        from .realtime import RealtimeTablecastAgent

        agent = RealtimeTablecastAgent(api, config, await api.realtime_configuration())
        ctx.log_context_fields = {
            "tableSessionId": config.tableSessionId,
            "voiceSessionId": config.voiceSessionId,
            "releaseSha": config.releaseSha,
        }
        language = "ja-JP" if config.locale == "ja" else "en-GB"
        synthesizer = inworld.TTS(
            model="inworld-tts-2",
            voice=config.voice,
            language=language,
            timestamp_type="WORD",
            delivery_mode="STABLE",
            max_buffer_delay_ms=300,
            speaking_rate=config.speechSpeed,
        )
        session: AgentSession = AgentSession(
            tts=synthesizer,
            vad=silero.VAD.load(),
            turn_handling=TurnHandlingOptions(
                turn_detection="vad",
                preemptive_generation={"enabled": False},
                interruption={"mode": "vad", "resume_false_interruption": False},
            ),
            use_tts_aligned_transcript=True,
            user_away_timeout=30,
        )
        session.on("user_state_changed", agent.user_state_changed)

        @ctx.room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
            if participant.identity == config.participantIdentity:
                agent.stop()
                session.shutdown(drain=False)

        async def shutdown() -> None:
            agent.stop()
            await session.aclose()
            await agent.close()
            await client.aclose()
            await asyncio.to_thread(flush_telemetry)

        ctx.add_shutdown_callback(shutdown)
        await ctx.connect()
        agent.text_publisher = VoiceTextPublisher(
            ctx.room.local_participant, config.participantIdentity, lambda: not agent.stopped
        )
        await session.start(
            agent=agent,
            record=recording_options(),
            room=ctx.room,
            room_options=room_io.RoomOptions(
                participant_identity=config.participantIdentity,
                text_input=False,
                audio_input=room_io.AudioInputOptions(pre_connect_audio=False),
                close_on_disconnect=True,
            ),
        )
        agent.background(agent.sync_configuration(synthesizer), agent.log, "configuration")
    except BaseException:
        await client.aclose()
        raise


def main() -> None:
    configure_telemetry()
    try:
        cli.run_app(server)
    finally:
        flush_telemetry()
