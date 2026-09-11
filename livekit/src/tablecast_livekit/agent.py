"""GPT-Liveの会話とMastraへの委任をLiveKitの公開APIで接続する。"""

import asyncio
import json
import logging
import os
from collections.abc import Coroutine
from contextlib import aclosing
from typing import Any
from uuid import uuid4

import httpx
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ConversationItemAddedEvent,
    JobContext,
    UserStateChangedEvent,
    cli,
    llm,
    room_io,
)
from livekit.plugins import silero
from livekit.plugins.openai.realtime import GPTLiveDelegation, GPTLiveModel
from pydantic import ValidationError

from .api import LiveConfiguration, TurnSkipped, VoiceAPI, VoiceConfiguration
from .telemetry import configure_telemetry, flush_telemetry, prewarm_telemetry, recording_options
from .voice_text import VoiceTextPublisher

logger = logging.getLogger("tablecast.voice")
server = AgentServer(
    port=int(os.environ.get("TABLECAST_AGENT_HEALTH_PORT", "0")),
    drain_timeout=600,
    num_idle_processes=1,
    setup_fnc=prewarm_telemetry,
)


class TablecastAgent(Agent):
    def __init__(self, api: VoiceAPI, config: VoiceConfiguration, live: LiveConfiguration) -> None:
        history = llm.ChatContext.empty()
        for item in live.history:
            history.add_message(role=item.role, content=item.content)
        super().__init__(
            instructions=live.instructions,
            chat_ctx=history,
            llm=GPTLiveModel(model=live.model, voice=config.voice, delegation="client"),
        )
        self.api = api
        self.config = config
        self.api.config = config
        self.log = logging.LoggerAdapter(
            logger,
            {
                "voiceSessionId": config.voiceSessionId,
                "tableSessionId": config.tableSessionId,
                "releaseSha": config.releaseSha,
            },
            merge_extra=True,
        )
        self.tasks: set[asyncio.Task[None]] = set()
        self.work: asyncio.Task[None] | None = None
        self.utterance_id = str(uuid4())
        self.delegated_utterance: str | None = None
        self.stopped = False
        self.proactive_attempted = False
        self.text_publisher: VoiceTextPublisher | None = None

    async def on_enter(self) -> None:
        self.duplex_session.on("delegation_created", self.delegation_created)

    def background(self, operation: Coroutine[Any, Any, None], name: str) -> asyncio.Task[None]:
        task = asyncio.create_task(operation)
        self.tasks.add(task)

        def completed(done: asyncio.Task[None]) -> None:
            self.tasks.discard(done)
            if not done.cancelled() and done.exception() is not None:
                self.log.error(
                    "tablecast.voice_background", extra={"operation": name, "phase": "failed"}
                )

        task.add_done_callback(completed)
        return task

    def user_state_changed(self, event: UserStateChangedEvent) -> None:
        if self.stopped:
            return
        if event.new_state == "speaking":
            self.utterance_id = str(uuid4())
            self.proactive_attempted = False
            if self.work is not None and not self.work.done():
                self.work.cancel()
        elif event.new_state == "away" and not self.proactive_attempted and self.config.proactive:
            self.proactive_attempted = True
            if self.work is None or self.work.done():
                self.work = self.background(self.delegate(None, str(uuid4())), "proactive")

    def delegation_created(self, delegation: GPTLiveDelegation) -> None:
        if self.stopped or self.delegated_utterance == self.utterance_id:
            return
        # 同じ発話の再委任を新しい承認にしない。次の発話で新しい業務turnを作る。
        self.delegated_utterance = self.utterance_id
        self.work = self.background(self.delegate(delegation, self.utterance_id), "delegation")

    async def delegate(self, delegation: GPTLiveDelegation | None, turn_id: str) -> None:
        messages = [
            {"role": item.role, "content": item.text_content[-2000:]}
            for item in self.chat_ctx.items
            if isinstance(item, llm.ChatMessage)
            and item.role in ("user", "assistant")
            and item.text_content
        ][-8:]
        if delegation is not None and delegation.pending_transcript:
            messages.append({"role": "user", "content": delegation.pending_transcript[-2000:]})
        if delegation is not None:
            # 確定字幕の後に待機の声かけがあっても、最後の客発話を委任する。
            while messages and messages[-1]["role"] != "user":
                messages.pop()
            if not messages:
                return
        status = "failed"
        try:
            result = ""
            async with aclosing(
                self.api.stream_turn(
                    turn_id,
                    self.config.locale,
                    messages,
                    trigger="proactive" if delegation is None else "user",
                    transport="live",
                )
            ) as stream:
                async for chunk in stream:
                    result += chunk
            if self.stopped or (delegation is not None and self.utterance_id != turn_id):
                status = "interrupted"
                return
            # バックエンドの結果を会話本文として保存しない。実際の発話イベントを別途保存する。
            # appendの500 tokens上限に収まるよう、UTF-8で最大400 bytesの100文字ごとに送る。
            for start in range(0, len(result), 100):
                self.duplex_session.append_commentary(
                    result[start : start + 100], delegation_id=delegation.id if delegation else None
                )
            status = "completed"
        except TurnSkipped:
            return
        except asyncio.CancelledError:
            status = "interrupted"
            raise
        except (httpx.HTTPError, ValueError):
            self.log.warning("tablecast.voice_delegation_failed", extra={"turnId": turn_id})
            if not self.stopped:
                self.duplex_session.append_commentary(
                    "処理を完了できませんでした。画面で現在の状態を確認してください。"
                    if self.config.locale == "ja"
                    else "I could not complete that. Please check the current state on screen.",
                    delegation_id=delegation.id if delegation else None,
                )
        finally:
            await self.api.end_turn(turn_id, status)

    def conversation_item_added(self, event: ConversationItemAddedEvent) -> None:
        item = event.item
        if (
            self.stopped
            or not isinstance(item, llm.ChatMessage)
            or item.role not in ("user", "assistant")
            or not item.text_content
        ):
            return
        text = item.text_content[:10000]
        if self.text_publisher is not None:
            if item.role == "user":
                self.text_publisher.send(
                    {"type": "user", "id": item.id, "turnId": item.id, "text": text, "final": True}
                )
            else:
                self.text_publisher.begin_turn(item.id)
                self.text_publisher.send(
                    {
                        "type": "assistant",
                        "turnId": item.id,
                        "text": text,
                        "rawText": text,
                        "final": True,
                    }
                )
        self.background(
            self.api.conversation_item(item.id, item.role, text, item.interrupted), "conversation"
        )

    def stop(self) -> None:
        self.stopped = True
        if self.work is not None:
            self.work.cancel()
        if self.text_publisher is not None:
            self.text_publisher.stop()

    async def close(self) -> None:
        self.stop()
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        if self.text_publisher is not None:
            await self.text_publisher.aclose()

    async def sync_configuration(self) -> None:
        while not self.stopped:
            await asyncio.sleep(2)
            try:
                async with asyncio.timeout(5):
                    config = await self.api.configuration()
                if self.stopped:
                    return
                if (
                    config.voiceSessionId != self.config.voiceSessionId
                    or config.tableSessionId != self.config.tableSessionId
                    or config.locale != self.config.locale
                ):
                    self.stop()
                    self.session.shutdown(drain=False)
                    return
                if config.speechSpeed != self.config.speechSpeed:
                    self.duplex_session.append_instructions(
                        f"話速の希望が{config.speechSpeed}倍相当に変わりました。自然な範囲で調整してください。"
                    )
                self.config = config
            except httpx.HTTPStatusError as error:
                if error.response.status_code in (401, 403, 409):
                    self.stop()
                    self.session.shutdown(drain=False)
                    return
                self.log.warning("tablecast.voice_configuration_unavailable")
            except (httpx.RequestError, TimeoutError, ValidationError):
                self.log.warning("tablecast.voice_configuration_unavailable")


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
        agent = TablecastAgent(api, config, await api.live_configuration())
        ctx.log_context_fields = {
            "tableSessionId": config.tableSessionId,
            "voiceSessionId": config.voiceSessionId,
            "releaseSha": config.releaseSha,
        }
        session: AgentSession = AgentSession(vad=silero.VAD.load(), user_away_timeout=30)
        session.on("user_state_changed", agent.user_state_changed)
        session.on("conversation_item_added", agent.conversation_item_added)

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
            # 計測は通常のbatch送信とprocess終了時のflushへ委ね、job終了時は待たない。

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
        agent.background(agent.sync_configuration(), "configuration")
    except BaseException:
        await client.aclose()
        raise


def main() -> None:
    configure_telemetry()
    try:
        cli.run_app(server)
    finally:
        flush_telemetry()
