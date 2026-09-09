import { voiceCredentialsSchema } from "../../lib/responses";
import type { Locale } from "@tablecast/api/schema";
import type { LocalAudioTrack, RemoteAudioTrack, Room } from "livekit-client";
import { z } from "zod";
import { api, ApiFailure, json } from "../../lib/api";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "stopping"
  | "paused"
  | "error";
export type LiveMessage = {
  id: string;
  role: "user" | "assistant";
  turnId?: string;
  text: string;
  rawText?: string;
  final: boolean;
  interrupted?: boolean;
  createdAt: number;
  speaker?: string;
  streamId?: string;
  locale?: Locale;
  displayIncomplete?: boolean;
};
export type VoiceView = {
  status: VoiceStatus;
  error?: "permission" | "unconfigured" | "connection" | "active";
  interim?: string;
  messages?: LiveMessage[];
  inputTrack?: LocalAudioTrack;
  outputTrack?: RemoteAudioTrack;
};
const voicePacket = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("user"),
    id: z.string().max(200),
    turnId: z.string().optional(),
    text: z.string().max(10000),
    final: z.boolean(),
    speaker: z.object({ id: z.string().nullable(), streamId: z.string() }).optional(),
  }),
  z.object({
    type: z.literal("assistant"),
    turnId: z.string().max(200),
    text: z.string().max(10000),
    rawText: z.string().max(16000),
    final: z.boolean(),
  }),
  z.object({ type: z.literal("interrupted"), turnId: z.string().max(200) }),
  z.object({
    type: z.literal("error"),
    turnId: z.string().max(200),
    code: z.enum(["VOICE_TEXT_TOO_LARGE", "VOICE_RESPONSE_FAILED"]),
  }),
]);
type Credentials = { voiceSessionId: string; token: string; url: string };

export class VoiceConnection {
  private attempt = 0;
  private view: VoiceView = { status: "idle" };
  private room?: Room;
  private microphone?: LocalAudioTrack;
  private sessionId?: string;
  private audio = new Set<HTMLMediaElement>();
  private desired = false;
  private stopping?: Promise<void>;

  constructor(
    private onChange: (view: VoiceView) => void,
    private onSync: () => void,
  ) {}

  async start(locale: Locale) {
    if (this.desired || this.stopping) return;
    this.desired = true;
    const attempt = ++this.attempt;
    this.emit({ status: "connecting" });
    let created: Credentials | undefined;
    try {
      created = await api(
        "/api/table/voice/start",
        json("POST", { locale }),
        voiceCredentialsSchema,
      );
      if (!this.current(attempt)) {
        await this.retire(created.voiceSessionId);
        return;
      }
      this.sessionId = created.voiceSessionId;
      const {
        Room: LiveKitRoom,
        RemoteAudioTrack,
        RoomEvent,
        Track,
        createLocalAudioTrack,
      } = await import("livekit-client");
      if (!this.current(attempt)) return;
      const room = new LiveKitRoom({
        adaptiveStream: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.room = room;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (
          !this.current(attempt) ||
          track.kind !== Track.Kind.Audio ||
          !(track instanceof RemoteAudioTrack) ||
          !participant.isAgent
        )
          return;
        this.emit({ outputTrack: track });
        const element = track.attach();
        element.autoplay = true;
        this.audio.add(element);
        document.body.append(element);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (this.view.outputTrack === track) this.emit({ outputTrack: undefined });
        for (const element of track.detach()) {
          element.pause();
          element.remove();
          this.audio.delete(element);
        }
      });
      room.on(RoomEvent.ParticipantAttributesChanged, (attributes, participant) => {
        if (!this.current(attempt) || !participant.isAgent) return;
        const state = attributes["lk.agent.state"];
        if (state === "listening" || state === "thinking" || state === "speaking")
          this.emit({ status: state });
      });
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (
          !this.current(attempt) ||
          !participant?.isAgent ||
          topic !== "tablecast.voice" ||
          payload.byteLength > 64000
        )
          return;
        try {
          const packet = voicePacket.safeParse(JSON.parse(new TextDecoder().decode(payload)));
          if (!packet.success) return;
          const data = packet.data;
          const messages = this.view.messages ?? [];
          if (data.type === "interrupted" || data.type === "error") {
            const displayIncomplete = data.type === "error" && data.code === "VOICE_TEXT_TOO_LARGE";
            this.emit({
              messages: messages.map((message) =>
                message.role === "assistant" && message.turnId === data.turnId
                  ? { ...message, interrupted: !displayIncomplete, displayIncomplete, final: true }
                  : message,
              ),
            });
            this.onSync();
            return;
          }
          const id = data.type === "user" ? data.id : data.turnId;
          const previous = messages.find(
            (message) => message.id === id && message.role === data.type,
          );
          const next: LiveMessage = {
            id,
            role: data.type,
            locale,
            text: data.text,
            final: data.final,
            turnId: data.turnId,
            createdAt: previous?.createdAt ?? Date.now(),
            ...(data.type === "assistant"
              ? { rawText: data.rawText }
              : { speaker: data.speaker?.id ?? undefined, streamId: data.speaker?.streamId }),
          };
          this.emit({
            messages: [
              ...messages.filter((message) => !(message.id === id && message.role === data.type)),
              next,
            ].slice(-100),
          });
          if (data.final) this.onSync();
        } catch {
          /* 不正なデータパケットは会話へ表示しない。 */
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (!this.current(attempt)) return;
        void this.stop().then(() => this.emit({ status: "error", error: "connection" }));
      });
      await room.connect(created.url, created.token);
      if (!this.current(attempt)) {
        await room.disconnect(true);
        return;
      }
      const microphone = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (!this.current(attempt)) {
        microphone.stop();
        await room.disconnect(true);
        return;
      }
      this.microphone = microphone;
      this.emit({ inputTrack: microphone });
      await room.localParticipant.publishTrack(microphone);
      if (!this.current(attempt)) {
        microphone.stop();
        await room.disconnect(true);
        return;
      }
      await room.startAudio();
      if (this.current(attempt)) this.emit({ status: "listening" });
    } catch (error) {
      if (!this.current(attempt)) return;
      if (error instanceof ApiFailure && error.code === "VOICE_ALREADY_ACTIVE") {
        this.desired = false;
        ++this.attempt;
        this.emit({ status: "error", error: "active" });
        this.onSync();
        return;
      }
      const reason =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "permission"
          : error instanceof ApiFailure && error.status === 503
            ? "unconfigured"
            : "connection";
      await this.stop();
      this.emit({ status: "error", error: reason });
    }
  }

  synchronise(sessionId: string | null, active: boolean) {
    if (this.sessionId && (!active || this.sessionId !== sessionId))
      void this.stop({ serverStopped: true });
  }

  stop({
    existingSession = false,
    serverStopped = false,
  }: { existingSession?: boolean; serverStopped?: boolean } = {}): Promise<void> {
    if (this.stopping) return this.stopping;
    if (!existingSession && !this.desired && !this.room && !this.microphone && !this.sessionId)
      return Promise.resolve();
    this.desired = false;
    ++this.attempt;
    this.emit({ status: "stopping" });
    this.microphone?.stop();
    this.microphone = undefined;
    for (const element of this.audio) {
      element.pause();
      element.srcObject = null;
      element.remove();
    }
    this.audio.clear();
    const room = this.room;
    const sessionId = this.sessionId;
    this.room = undefined;
    this.sessionId = undefined;
    this.stopping = Promise.allSettled([
      room?.disconnect(true),
      ...(serverStopped ? [] : [this.retire(sessionId)]),
    ])
      .then((results) => {
        this.emit(
          results.some((result) => result.status === "rejected")
            ? { status: "error", error: "connection" }
            : { status: "paused" },
        );
        this.onSync();
      })
      .finally(() => {
        this.stopping = undefined;
      });
    return this.stopping;
  }

  private emit(change: Partial<VoiceView>) {
    this.view = { ...this.view, ...change };
    if (change.status === "connecting") this.view.error = undefined;
    if (["stopping", "paused", "error"].includes(change.status ?? "")) {
      this.view.inputTrack = undefined;
      this.view.outputTrack = undefined;
      this.view.messages = this.view.messages?.map((message) =>
        message.final ? message : { ...message, final: true, interrupted: true },
      );
    }
    this.onChange(this.view);
  }
  private current(attempt: number) {
    return this.desired && this.attempt === attempt;
  }
  private async retire(voiceSessionId?: string) {
    await api(
      "/api/table/voice/stop",
      json("POST", { ...(voiceSessionId ? { voiceSessionId } : {}) }),
    );
  }
}
