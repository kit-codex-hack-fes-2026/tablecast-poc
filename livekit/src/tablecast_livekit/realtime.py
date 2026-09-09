"""Realtimeの音声理解とInworldの読み上げを公開Session APIで接続する。"""

import asyncio
from collections import deque
from collections.abc import AsyncIterable, AsyncIterator
from uuid import uuid4

import httpx
from livekit import rtc
from livekit.agents import (
    Agent,
    ModelSettings,
    RunContext,
    StopResponse,
    UserStateChangedEvent,
    function_tool,
    llm,
)
from livekit.agents.voice.events import SpeechCreatedEvent
from livekit.plugins import openai
from openai.types.realtime import AudioTranscription, RealtimeReasoning

from .agent import TablecastAgent
from .api import RealtimeConfiguration, TurnSkipped, VoiceAPI, VoiceConfiguration
from .speech import CaptionFormatter, caption


class RealtimeTablecastAgent(TablecastAgent):
    def __init__(
        self, api: VoiceAPI, config: VoiceConfiguration, realtime: RealtimeConfiguration
    ) -> None:
        super().__init__(
            api,
            config,
            instructions=realtime.instructions,
            tools=[self.proxy_tool(schema) for schema in realtime.tools],
            model=openai.realtime.RealtimeModel(
                model=realtime.model,
                modalities=["text"],
                turn_detection=None,
                input_audio_transcription=AudioTranscription(
                    model="gpt-4o-transcribe", language=config.locale
                ),
                input_audio_noise_reduction="far_field",
                reasoning=RealtimeReasoning(effort="low"),
                tracing=None,
            ),
        )

        self.pending_audio_turns: deque[str] = deque()
        self.item_turns: dict[str, str] = {}
        self.speech_turns: dict[str, str] = {}
        self.tool_lock = asyncio.Lock()
        self.failed_turns: set[str] = set()
        self.reply_text = ("", "")

    async def on_enter(self) -> None:
        self.realtime_llm_session.on("remote_item_added", self.remote_item_added)
        self.realtime_llm_session.on("input_audio_transcription_completed", self.transcribed)
        self.session.on("speech_created", self.speech_created)
        self.realtime_llm_session.on("error", self.model_failed)

    def model_failed(self, event: llm.RealtimeModelError) -> None:
        if self.turn_id and not self.stopped:
            self.failed_turns.add(self.turn_id)
            if self.text_publisher:
                self.text_publisher.send(
                    {"type": "error", "turnId": self.turn_id, "code": "VOICE_RESPONSE_FAILED"}
                )
            self.background(self.api.end_turn(self.turn_id, "failed"), self.log, "model_error")

    async def begin_turn(self, *, proactive: bool = False) -> str:
        if self.stopped:
            raise StopResponse()
        turn_id = str(uuid4())
        await self.api.start_turn(turn_id, self.config.locale, proactive=proactive)
        if self.stopped:
            await self.api.end_turn(turn_id, "interrupted")
            raise StopResponse()
        self.turn_id = turn_id
        self.reply_text = ("", "")
        if self.text_publisher:
            self.text_publisher.begin_turn(turn_id)
        return turn_id

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        # 字幕を待たずに認可する。このhookの後でSDKが音声をcommitし応答を開始する。
        turn_id = await self.begin_turn()
        self.pending_audio_turns.append(turn_id)

    def remote_item_added(self, event: llm.RemoteItemAddedEvent) -> None:
        if (
            isinstance(event.item, llm.ChatMessage)
            and event.item.role == "user"
            and self.pending_audio_turns
        ):
            self.item_turns[event.item.id] = self.pending_audio_turns.popleft()

    def transcribed(self, event: llm.InputTranscriptionCompleted) -> None:
        turn_id = self.item_turns.get(event.item_id)
        if self.stopped or not turn_id:
            return
        if self.text_publisher:
            self.text_publisher.send(
                {
                    "type": "user",
                    "id": event.item_id,
                    "turnId": turn_id,
                    "text": event.transcript,
                    "final": event.is_final,
                }
            )
        if event.is_final:
            self.background(self.api.transcript(turn_id, event.transcript), self.log, "transcript")
            self.item_turns.pop(event.item_id, None)

    def speech_created(self, event: SpeechCreatedEvent) -> None:
        if not self.turn_id or self.stopped:
            return
        turn_id = self.turn_id
        self.speech_turns[event.speech_handle.id] = turn_id
        if event.source == "generate_reply":
            self.background(self.finish_reply(turn_id, event), self.log, "playback")

    async def finish_reply(self, turn_id: str, event: SpeechCreatedEvent) -> None:
        speech = event.speech_handle
        try:
            await self.record_playback(turn_id, speech)
            status = (
                "failed"
                if speech.exception() or turn_id in self.failed_turns
                else "interrupted"
                if speech.interrupted
                else "completed"
            )
            await self.api.end_turn(turn_id, status)
            if status == "completed" and not self.stopped and self.turn_id == turn_id:
                await self.read_confirmation(turn_id)
        finally:
            self.speech_turns.pop(speech.id, None)

    def proxy_tool(self, schema: dict[str, object]) -> llm.RawFunctionTool:
        name = str(schema["name"])

        async def invoke(raw_arguments: dict[str, object], context: RunContext) -> object:
            turn_id = self.speech_turns.get(context.speech_handle.id)
            if (
                self.stopped
                or not turn_id
                or turn_id != self.turn_id
                or context.speech_handle.interrupted
            ):
                raise StopResponse()
            # 業務書込みの順序を保ち、取消された待機ツールを実行しない。
            async with self.tool_lock:
                if self.stopped or turn_id != self.turn_id or context.speech_handle.interrupted:
                    raise StopResponse()
                try:
                    result = await self.api.tool(
                        turn_id, name, context.function_call.call_id, raw_arguments
                    )
                except httpx.HTTPStatusError as error:
                    failure = error.response.json().get("error", {})
                    code = failure.get("code", "VOICE_TOOL_FAILED")
                    if error.response.status_code in (401, 403) or code in (
                        "VOICE_SESSION_STALE",
                        "VOICE_LOCALE_STALE",
                        "PROACTIVE_TURN_STALE",
                    ):
                        raise StopResponse() from None
                    return {
                        "error": code,
                        "instruction": (
                            "操作は完了していません。最新状態を確認し、"
                            "必要な条件だけ聞いてください。"
                        ),
                    }
                if (
                    name == "setLanguage"
                    and isinstance(result, dict)
                    and result.get("voiceState") == "stopped"
                ):
                    self.stop()
                    self.session.shutdown(drain=False)
                    raise StopResponse()
                if name == "prepareConfirmation":
                    # 通常の応答が終わってから固定本文を読む。モデルの言い換えを再生しない。
                    raise StopResponse()
                return result

        return function_tool(invoke, raw_schema=schema)

    def user_state_changed(self, event: UserStateChangedEvent) -> None:
        if self.stopped:
            return
        if event.new_state == "speaking":
            self.proactive_attempted = False
            if self.proactive_speech:
                self.proactive_speech.interrupt()
            if self.turn_id:
                old_turn = self.turn_id
                self.turn_id = None
                speech = self.session.current_speech
                if speech is not None and not speech.done():
                    self.background(
                        self.api.end_turn(old_turn, "interrupted"), self.log, "interrupt"
                    )
        elif (
            event.new_state == "away"
            and not self.proactive_attempted
            and self.session.agent_state == "listening"
        ):
            self.proactive_attempted = True
            self.background(self.proactive_reply(), self.log, "proactive")

    async def proactive_reply(self) -> None:
        try:
            await self.begin_turn(proactive=True)
        except TurnSkipped:
            return
        if self.stopped or self.session.user_state == "speaking":
            return
        self.proactive_speech = self.session.generate_reply(
            instructions="客の新しい発話ではなく、許可された自発接客です。商品紹介を一つ短く話し、参照以外の操作や注文・確認・スタッフ呼出しは行わない。",
            allow_interruptions=True,
        )

    async def tts_node(
        self, text: AsyncIterable[str], model_settings: ModelSettings
    ) -> AsyncIterator[rtc.AudioFrame]:
        speech = self.session.current_speech
        turn_id = self.speech_turns.get(speech.id) if speech else None

        async def streaming_text() -> AsyncIterator[str]:
            formatter = CaptionFormatter(preserve_markup=True)
            display = CaptionFormatter()
            raw_text, display_text = self.reply_text
            try:
                async for chunk in text:
                    if self.stopped or (turn_id and turn_id != self.turn_id):
                        return
                    raw_text += chunk
                    display_text += display.push(chunk)
                    self.reply_text = (raw_text, display_text)
                    if turn_id and self.text_publisher:
                        self.text_publisher.send(
                            {
                                "type": "assistant",
                                "turnId": turn_id,
                                "text": display_text,
                                "rawText": raw_text,
                                "final": False,
                            }
                        )
                    valid = formatter.push(chunk)
                    if valid:
                        yield valid
                formatter.finish()
                display.finish()
            finally:
                if turn_id and self.text_publisher and turn_id == self.turn_id:
                    self.text_publisher.send(
                        {
                            "type": "assistant",
                            "turnId": turn_id,
                            "text": display_text,
                            "rawText": raw_text,
                            "final": True,
                        }
                    )

        # ツールだけの応答や演技タグだけの断片で、無音のTTS contextを開かない。
        source = streaming_text()
        prefix = ""
        async for chunk in source:
            prefix += chunk
            if caption(prefix).strip():
                break
        else:
            return

        async def spoken_text() -> AsyncIterator[str]:
            yield prefix
            async for chunk in source:
                yield chunk

        async for frame in Agent.default.tts_node(self, spoken_text(), model_settings):
            yield frame
