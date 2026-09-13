import {
  initialMicrophone,
  type MicrophoneError,
  type MicrophoneView,
  type LiveMessage,
  type VoiceView,
} from "./voice-model";
export type { VoiceStatus, VoiceView, LiveMessage } from "./voice-model";
import type { Locale } from "@tablecast/api/schema";
import type { LocalAudioTrack, Room } from "livekit-client";
import { z } from "zod";
import { parseResponse, tableEndpoint, type TableClient } from "../../lib/api";
import { apiError } from "../../lib/api-error";

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
    private client: TableClient = tableEndpoint.client,
  ) {}

  private microphoneView = initialMicrophone;
  private deviceRequest = 0;
  private microphoneErrorSource?: "devices" | "capture";

  observeMicrophones() {
    const refresh = () => {
      void this.refreshMicrophones();
    };
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    refresh();
    return () => {
      ++this.deviceRequest;
      navigator.mediaDevices?.removeEventListener("devicechange", refresh);
    };
  }

  async refreshMicrophones() {
    const request = ++this.deviceRequest;
    if (!navigator.mediaDevices?.enumerateDevices) {
      this.updateMicrophone({ error: "unsupported", loading: false }, "devices");
      return;
    }
    this.updateMicrophone({ loading: true });
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      if (request !== this.deviceRequest) return;
      const devices = all.filter((device) => device.kind === "audioinput");
      const named = devices.some((device) => Boolean(device.label));
      const missing =
        named &&
        this.microphoneView.selectedId !== "default" &&
        !devices.some((device) => device.deviceId === this.microphoneView.selectedId);
      const error = missing ? "disconnected" : devices.length === 0 ? "empty" : undefined;
      this.updateMicrophone(
        {
          devices: devices.filter((device) => device.deviceId),
          loading: false,
          permissionRequired: !named,
          limited:
            !navigator.mediaDevices.getSupportedConstraints().deviceId ||
            (named && devices.filter((device) => device.deviceId !== "default").length < 2),
          ...(error || this.microphoneErrorSource === "devices" ? { error } : {}),
        },
        "devices",
      );
      if (missing && this.desired) await this.stop();
    } catch (error) {
      if (request === this.deviceRequest)
        this.updateMicrophone({ loading: false, error: microphoneError(error) }, "devices");
    }
  }

  async selectMicrophone(deviceId: string) {
    if (this.view.status === "connecting" || this.microphoneView.switching) return;
    const microphone = this.microphone;
    if (!this.desired || !microphone) {
      this.updateMicrophone({ selectedId: deviceId, error: undefined });
      return;
    }
    const attempt = this.attempt;
    this.updateMicrophone({ switching: true, error: undefined });
    try {
      const switched = await microphone.setDeviceId(
        deviceId === "default" ? "default" : { exact: deviceId },
      );
      if (!this.current(attempt)) {
        microphone.stop();
        return;
      }
      if (!switched && deviceId !== "default") {
        await this.stop();
        this.updateMicrophone({ error: "unsupported" });
        return;
      }
      this.updateMicrophone({
        selectedId: deviceId,
        activeLabel: microphone.mediaStreamTrack.label,
      });
      this.emit({ inputTrack: microphone });
      void this.refreshMicrophones();
    } catch (error) {
      if (!this.current(attempt)) return;
      // SDKの切替は元のcaptureを終了するため、失敗時は明示再開を待つ。
      await this.stop();
      this.updateMicrophone({ error: microphoneError(error) });
    } finally {
      if (this.current(attempt)) this.updateMicrophone({ switching: false });
    }
  }

  private updateMicrophone(
    change: Partial<MicrophoneView>,
    errorSource: "devices" | "capture" = "capture",
  ) {
    if ("error" in change) this.microphoneErrorSource = change.error ? errorSource : undefined;
    this.microphoneView = { ...this.microphoneView, ...change };
    this.emit({ microphone: this.microphoneView });
  }

  async start(locale: Locale) {
    if (this.desired || this.stopping) return;
    this.desired = true;
    const attempt = ++this.attempt;
    this.emit({ status: "connecting" });
    let created: Credentials | undefined;
    try {
      created = await parseResponse(this.client.voice.start.$post());
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
        TrackEvent,
        LocalAudioTrack,
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
        document.body.appendChild(element);
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
      const selectedId = this.microphoneView.selectedId;
      const constraints: MediaTrackConstraints = {
        ...(selectedId === "default" ? {} : { deviceId: { exact: selectedId } }),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints,
        video: false,
      });
      // SDKの自動再取得を無効にし、captureの再開を明示操作だけに限定する。
      const microphone = new LocalAudioTrack(stream.getAudioTracks()[0], constraints, true);
      microphone.source = Track.Source.Microphone;
      if (!this.current(attempt)) {
        microphone.stop();
        await room.disconnect(true);
        return;
      }
      if (
        selectedId !== "default" &&
        microphone.mediaStreamTrack.getSettings().deviceId !== selectedId
      ) {
        microphone.stop();
        throw new DOMException("Microphone selection was not applied", "NotSupportedError");
      }
      this.microphone = microphone;
      microphone.on(TrackEvent.Restarted, () => {
        if (!this.current(attempt)) microphone.stop();
      });
      microphone.on(TrackEvent.Ended, () => {
        if (!this.current(attempt) || this.microphoneView.switching) return;
        void this.stop();
        this.updateMicrophone({ error: "disconnected" });
      });
      this.emit({ inputTrack: microphone });
      await room.localParticipant.publishTrack(microphone);
      if (!this.current(attempt)) {
        microphone.stop();
        await room.disconnect(true);
        return;
      }
      await room.startAudio();
      if (this.current(attempt)) {
        this.updateMicrophone({ activeLabel: microphone.mediaStreamTrack.label, error: undefined });
        this.emit({ status: "listening" });
        if (typeof navigator !== "undefined" && navigator.mediaDevices)
          void this.refreshMicrophones();
      }
    } catch (error) {
      if (!this.current(attempt)) return;
      if (apiError(error)?.code === "VOICE_ALREADY_ACTIVE") {
        this.desired = false;
        ++this.attempt;
        this.emit({ status: "error", error: "active" });
        this.onSync();
        return;
      }
      const reason =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "permission"
          : apiError(error)?.status === 503
            ? "unconfigured"
            : "connection";
      await this.stop();
      if (error instanceof DOMException) this.updateMicrophone({ error: microphoneError(error) });
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
    if (this.view.microphone) this.updateMicrophone({ activeLabel: undefined, switching: false });
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
    await parseResponse(
      this.client.voice.stop.$post({ json: voiceSessionId ? { voiceSessionId } : {} }),
    );
  }
}

function microphoneError(error: unknown): MicrophoneError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "permission";
    if (error.name === "NotSupportedError") return "unsupported";
    if (error.name === "NotFoundError") return "empty";
    if (error.name === "OverconstrainedError") return "disconnected";
  }
  return "failed";
}
