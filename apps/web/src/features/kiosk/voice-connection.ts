import { voiceCredentialsSchema } from "../../lib/responses";
import type { Locale } from "@tablecast/api/schema";
import type { LocalAudioTrack, Room } from "livekit-client";
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
export type VoiceView = {
  status: VoiceStatus;
  error?: "permission" | "unconfigured" | "connection" | "active";
  interim?: string;
};
type Credentials = { voiceSessionId: string; token: string; url: string };

export class VoiceConnection {
  private attempt = 0;
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
    this.onChange({ status: "connecting" });
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
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (!this.current(attempt) || track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        this.audio.add(element);
        document.body.append(element);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const element of track.detach()) {
          element.pause();
          element.remove();
          this.audio.delete(element);
        }
      });
      room.on(RoomEvent.ParticipantAttributesChanged, (attributes) => {
        if (!this.current(attempt)) return;
        const state = attributes["lk.agent.state"];
        if (state === "listening" || state === "thinking" || state === "speaking")
          this.onChange({ status: state });
      });
      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        if (!this.current(attempt)) return;
        if (participant?.isLocal) {
          const interim = segments
            .filter((segment) => !segment.final)
            .map((segment) => segment.text)
            .join(" ");
          this.onChange({ status: "listening", interim });
        }
        if (segments.some((segment) => segment.final)) this.onSync();
      });
      room.on(RoomEvent.Disconnected, () => {
        if (!this.current(attempt)) return;
        void this.stop().then(() => this.onChange({ status: "error", error: "connection" }));
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
      await room.localParticipant.publishTrack(microphone);
      if (!this.current(attempt)) {
        microphone.stop();
        await room.disconnect(true);
        return;
      }
      await room.startAudio();
      if (this.current(attempt)) this.onChange({ status: "listening" });
    } catch (error) {
      if (!this.current(attempt)) return;
      if (error instanceof ApiFailure && error.code === "VOICE_ALREADY_ACTIVE") {
        this.desired = false;
        ++this.attempt;
        this.onChange({ status: "error", error: "active" });
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
      this.onChange({ status: "error", error: reason });
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
    this.onChange({ status: "stopping" });
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
        this.onChange(
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
