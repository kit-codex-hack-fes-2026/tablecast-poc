import {
  initialMicrophone,
  type MicrophoneError,
  type MicrophoneView,
  type LiveMessage,
  type VoiceView,
} from "./voice-model";
export type { VoiceStatus, VoiceView, LiveMessage } from "./voice-model";
import { voiceToolNameSchema } from "@tablecast/api/schema";
import type { Locale } from "@tablecast/api/schema";
import { z } from "zod";
import { parseResponse, tableEndpoint, type TableClient } from "../../lib/api";
import { apiError } from "../../lib/api-error";

const transcriptEvent = z.object({
  type: z.enum(["session.input_transcript.delta", "session.output_transcript.delta"]),
  event_id: z.string(),
  delta: z.string().max(10000),
  start_ms: z.number().nonnegative(),
  end_ms: z.number().nonnegative(),
});
const delegationEvent = z.object({
  type: z.literal("session.delegation.created"),
  delegation: z.object({ id: z.string().max(200), target: z.literal("responses") }),
});
const responseEnvelope = z.object({
  type: z.literal("response.event"),
  delegation_id: z.string(),
  event: z.discriminatedUnion("type", [
    z.object({ type: z.literal("response.created"), response: z.object({ id: z.string() }) }),
    z.object({
      type: z.literal("response.output_item.done"),
      response_id: z.string().optional(),
      item: z.object({
        type: z.string(),
        call_id: z.string().optional(),
        name: z.string().optional(),
        arguments: z.string().optional(),
      }),
    }),
    z.object({
      type: z.enum(["response.completed", "response.failed", "response.incomplete"]),
      response: z.object({ id: z.string() }),
    }),
  ]),
});
type PendingResponse = {
  calls: { callId: string; name: string; arguments: string }[];
  handled: boolean;
};
type Caption = {
  message: LiveMessage;
  start: number;
  end: number;
  fragments: { text: string; start: number; end: number }[];
  timer?: ReturnType<typeof setTimeout>;
};
type SavedCaption = {
  itemId: string;
  role: "user" | "assistant";
  text: string;
  interrupted: boolean;
};

export class VoiceConnection {
  private attempt = 0;
  private view: VoiceView = { status: "idle" };
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private microphone?: MediaStream;
  private microphoneSender?: RTCRtpSender;
  private switchingMicrophone?: MediaStream;
  private audio?: HTMLAudioElement;
  private sessionId?: string;
  private desired = false;
  private ready = false;
  private stopping?: Promise<void>;
  private startingRequest?: AbortController;
  private delegation?: AbortController;
  private delegations = new Map<string, Promise<string | undefined>>();
  private responses = new Map<string, PendingResponse>();
  private responseIds = new Map<string, string>();
  private activeDelegation?: string;
  private transcriptEvents = new Set<string>();
  private captions: Caption[] = [];
  private pendingCaptions = new Map<string, SavedCaption>();
  private saving?: Promise<void>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private proactiveTimer?: ReturnType<typeof setTimeout>;
  private proactive = false;
  private openingRequest?: AbortController;
  private suggestionsRequest?: AbortController;
  private guidanceVersion = 0;
  private locale: Locale = "ja";
  private speechSpeed = 1;
  private requestedSpeechSpeed = 1;

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
      let error: MicrophoneError | undefined;
      if (missing) {
        error = "disconnected";
      } else if (devices.length === 0) {
        error = "empty";
      }
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
    const sender = this.microphoneSender;
    if (!this.desired || !microphone || !sender) {
      this.updateMicrophone({ selectedId: deviceId, error: undefined });
      return;
    }
    const attempt = this.attempt;
    this.updateMicrophone({ switching: true, error: undefined });
    let replacement: MediaStream | undefined;
    try {
      replacement = await this.captureMicrophone(deviceId);
      if (!this.current(attempt)) {
        replacement.getTracks().forEach((source) => source.stop());
        return;
      }
      this.switchingMicrophone = replacement;
      const track = replacement.getAudioTracks()[0];
      await sender.replaceTrack(track);
      if (!this.current(attempt)) {
        replacement.getTracks().forEach((source) => source.stop());
        return;
      }
      this.microphone = replacement;
      this.observeMicrophone(replacement, attempt);
      microphone.getTracks().forEach((source) => source.stop());
      this.updateMicrophone({ selectedId: deviceId, activeLabel: track.label });
      this.emit({ inputTrack: track });
      void this.refreshMicrophones();
    } catch (error) {
      replacement?.getTracks().forEach((track) => track.stop());
      if (!this.current(attempt)) return;
      await this.stop();
      this.updateMicrophone({ error: microphoneError(error) });
    } finally {
      if (this.switchingMicrophone === replacement) this.switchingMicrophone = undefined;
      if (this.current(attempt)) this.updateMicrophone({ switching: false });
    }
  }

  private async captureMicrophone(deviceId: string) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId === "default" ? {} : { deviceId: { exact: deviceId } }),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (deviceId !== "default" && stream.getAudioTracks()[0].getSettings().deviceId !== deviceId) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException("Microphone selection was not applied", "NotSupportedError");
    }
    return stream;
  }

  private observeMicrophone(stream: MediaStream, attempt: number) {
    stream.getAudioTracks()[0].addEventListener(
      "ended",
      () => {
        if (!this.current(attempt) || this.microphone !== stream) return;
        void this.stop();
        this.updateMicrophone({ error: "disconnected" });
      },
      { once: true },
    );
  }

  private updateMicrophone(
    change: Partial<MicrophoneView>,
    errorSource: "devices" | "capture" = "capture",
  ) {
    if ("error" in change) this.microphoneErrorSource = change.error ? errorSource : undefined;
    this.microphoneView = { ...this.microphoneView, ...change };
    this.emit({ microphone: this.microphoneView });
  }

  async start(locale: Locale, speechSpeed = 1) {
    if (this.desired || this.stopping) return;
    this.desired = true;
    this.ready = false;
    this.locale = locale;
    this.speechSpeed = speechSpeed;
    this.requestedSpeechSpeed = speechSpeed;
    this.captions = [];
    this.pendingCaptions.clear();
    this.delegations.clear();
    this.responses.clear();
    this.responseIds.clear();
    this.activeDelegation = undefined;
    this.transcriptEvents.clear();
    const attempt = ++this.attempt;
    this.clearGuidance();
    this.emit({ status: "connecting", messages: [], openingFailed: false });
    try {
      const peer = new RTCPeerConnection();
      this.peer = peer;
      const audio = new Audio();
      audio.autoplay = true;
      this.audio = audio;
      peer.addEventListener("track", ({ track }) => {
        if (!this.current(attempt) || track.kind !== "audio") return;
        audio.srcObject = new MediaStream([track]);
        this.emit({ outputTrack: track });
        void audio.play().catch(() => this.fail(attempt));
      });
      peer.addEventListener("connectionstatechange", () => {
        if (peer.connectionState === "failed" || peer.connectionState === "closed")
          void this.fail(attempt);
      });
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.addEventListener("message", ({ data }) => {
        if (!this.current(attempt) || typeof data !== "string" || data.length > 64000) return;
        let event: unknown;
        try {
          event = JSON.parse(data);
        } catch {
          return;
        }
        if (!event || typeof event !== "object" || !("type" in event)) return;
        if (event.type === "session.started") {
          if (this.ready) return;
          clearTimeout(this.readyTimer);
          this.ready = true;
          this.emit({ status: "listening" });
          this.updateSpeechSpeed();
          this.scheduleProactive(attempt);
          void this.opening(attempt);
        } else if (event.type === "session.closed" || event.type === "error") {
          void this.fail(attempt);
        } else {
          const transcript = transcriptEvent.safeParse(event);
          if (transcript.success) this.receiveCaption(transcript.data, attempt);
          else {
            const delegation = delegationEvent.safeParse(event);
            if (delegation.success) {
              const id = delegation.data.delegation.id;
              if (!this.delegations.has(id)) {
                this.clearGuidance();
                this.activeDelegation = id;
                this.delegation?.abort();
                this.delegation = undefined;
                this.delegations.set(id, this.registerDelegation(id, "user", attempt));
              }
            } else {
              const envelope = responseEnvelope.safeParse(event);
              if (envelope.success) void this.receiveResponse(envelope.data, attempt);
            }
          }
        }
      });
      channel.addEventListener("close", () => void this.fail(attempt));
      channel.addEventListener("error", () => void this.fail(attempt));
      const microphone = await this.captureMicrophone(this.microphoneView.selectedId);
      if (!this.current(attempt)) {
        microphone.getTracks().forEach((track) => track.stop());
        peer.close();
        return;
      }
      this.microphone = microphone;
      const track = microphone.getAudioTracks()[0];
      this.microphoneSender = peer.addTrack(track, microphone);
      this.observeMicrophone(microphone, attempt);
      this.updateMicrophone({ activeLabel: track.label, error: undefined });
      this.emit({ inputTrack: track });
      void this.refreshMicrophones();
      await peer.setLocalDescription(await peer.createOffer());
      if (peer.iceGatheringState !== "complete")
        await new Promise<void>((resolve, reject) => {
          const done = () => {
            clearTimeout(timeout);
            peer.removeEventListener("icegatheringstatechange", changed);
            resolve();
          };
          const changed = () => {
            if (peer.iceGatheringState === "complete") done();
          };
          const timeout = setTimeout(() => {
            peer.removeEventListener("icegatheringstatechange", changed);
            reject(new Error("音声接続候補の取得が期限を超えた"));
          }, 10000);
          peer.addEventListener("icegatheringstatechange", changed);
          changed();
        });
      if (!this.current(attempt)) return;
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("音声接続候補を取得できなかった");
      const controller = new AbortController();
      this.startingRequest = controller;
      const created = await parseResponse(
        this.client.voice.start.$post({ json: { sdp } }, { init: { signal: controller.signal } }),
      );
      if (this.startingRequest === controller) this.startingRequest = undefined;
      if (!this.current(attempt)) {
        await this.retire(created.voiceSessionId);
        return;
      }
      this.sessionId = created.voiceSessionId;
      this.proactive = created.proactive;
      await peer.setRemoteDescription({ type: "answer", sdp: created.sdp });
      if (this.current(attempt) && !this.ready)
        this.readyTimer = setTimeout(() => void this.fail(attempt), 15000);
    } catch (error) {
      if (!this.current(attempt)) return;
      const reason =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "permission"
          : apiError(error)?.code === "VOICE_ALREADY_ACTIVE"
            ? "active"
            : apiError(error)?.status === 503
              ? "unconfigured"
              : "connection";
      await this.stop();
      if (error instanceof DOMException) this.updateMicrophone({ error: microphoneError(error) });
      this.emit({ status: "error", error: reason });
    }
  }

  synchronise(sessionId: string | null, active: boolean, speechSpeed: number) {
    this.requestedSpeechSpeed = speechSpeed;
    if (this.sessionId && (!active || this.sessionId !== sessionId))
      void this.stop({ serverStopped: true });
    else if (this.sessionId === sessionId && active) this.updateSpeechSpeed();
  }

  private updateSpeechSpeed() {
    if (!this.ready || !this.desired || this.speechSpeed === this.requestedSpeechSpeed) return;
    this.channel?.send(
      JSON.stringify({
        type: "session.instructions.append",
        event_id: crypto.randomUUID(),
        delegation_id: null,
        content: `話速の希望は${this.requestedSpeechSpeed}倍相当です。次の発話から反映してください。`,
      }),
    );
    this.speechSpeed = this.requestedSpeechSpeed;
  }

  stop({
    existingSession = false,
    serverStopped = false,
  }: { existingSession?: boolean; serverStopped?: boolean } = {}): Promise<void> {
    if (this.stopping) return this.stopping;
    if (!existingSession && !this.desired && !this.peer && !this.microphone && !this.sessionId)
      return Promise.resolve();
    this.desired = false;
    this.ready = false;
    this.clearGuidance();
    ++this.attempt;
    this.startingRequest?.abort();
    this.startingRequest = undefined;
    this.delegation?.abort();
    this.delegation = undefined;
    clearTimeout(this.proactiveTimer);
    clearTimeout(this.readyTimer);
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    for (const caption of this.captions) {
      clearTimeout(caption.timer);
      if (!caption.message.final) this.finishCaption(caption, caption.message.role === "assistant");
    }
    this.emit({ status: "stopping", messages: this.captions.map((row) => row.message) });
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = undefined;
    this.microphoneSender = undefined;
    this.switchingMicrophone?.getTracks().forEach((track) => track.stop());
    this.switchingMicrophone = undefined;
    if (this.view.microphone) this.updateMicrophone({ activeLabel: undefined, switching: false });
    this.audio?.pause();
    if (this.audio) this.audio.srcObject = null;
    this.audio = undefined;
    const peer = this.peer;
    const channel = this.channel;
    const sessionId = this.sessionId;
    this.peer = undefined;
    this.channel = undefined;
    this.stopping = Promise.allSettled([
      this.closeTransport(peer, channel),
      (async () => {
        try {
          if (!serverStopped && sessionId) await this.saveCaptions(sessionId);
        } finally {
          if (!serverStopped && (sessionId || existingSession)) await this.retire(sessionId);
        }
      })(),
    ])
      .then((results) => {
        this.sessionId = undefined;
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

  private receiveCaption(event: z.infer<typeof transcriptEvent>, attempt: number) {
    if (this.transcriptEvents.has(event.event_id) || event.end_ms < event.start_ms || !event.delta)
      return;
    this.transcriptEvents.add(event.event_id);
    this.clearGuidance();
    const guidanceVersion = this.guidanceVersion;
    const role = event.type === "session.input_transcript.delta" ? "user" : "assistant";
    // 字幕のまとまりは表示だけに使い、委任開始や業務の中断条件には使わない。
    let caption = this.captions.findLast(
      (row) =>
        row.message.role === role &&
        !row.message.interrupted &&
        row.message.text.length + event.delta.length <= 10000 &&
        event.start_ms <= row.end + 1500 &&
        event.end_ms >= row.start - 1500,
    );
    if (!caption) {
      const id = crypto.randomUUID();
      caption = {
        message: {
          id,
          turnId: id,
          role,
          locale: this.locale,
          text: "",
          final: false,
          createdAt: Date.now(),
        },
        start: event.start_ms,
        end: event.end_ms,
        fragments: [],
      };
      this.captions.push(caption);
      if (this.captions.length > 100) {
        const oldest = this.captions.shift();
        if (oldest && !oldest.message.final) this.finishCaption(oldest, false);
      }
    }
    clearTimeout(caption.timer);
    caption.fragments.push({ text: event.delta, start: event.start_ms, end: event.end_ms });
    caption.start = Math.min(caption.start, event.start_ms);
    caption.end = Math.max(caption.end, event.end_ms);
    caption.message = {
      ...caption.message,
      text: caption.fragments
        .toSorted((a, b) => a.start - b.start)
        .map((part) => part.text)
        .join(""),
      final: false,
    };
    const current = caption;
    caption.timer = setTimeout(() => {
      if (!this.current(attempt)) return;
      this.finishCaption(current, false);
      this.emit({
        messages: this.captions.map((row) => row.message),
        status: this.delegation ? "thinking" : "listening",
      });
      this.scheduleSave();
      if (
        guidanceVersion === this.guidanceVersion &&
        current.message.role === "assistant" &&
        this.captions.at(-1) === current
      )
        void this.suggestReplies(current, attempt);
    }, 1500);
    this.emit({
      messages: this.captions.map((row) => row.message),
      status: role === "assistant" ? "speaking" : "listening",
    });
    this.scheduleProactive(attempt);
  }

  private finishCaption(caption: Caption, interrupted: boolean) {
    clearTimeout(caption.timer);
    caption.message = { ...caption.message, final: true, interrupted };
    this.pendingCaptions.set(caption.message.id, {
      itemId: caption.message.id,
      role: caption.message.role,
      text: caption.message.text,
      interrupted,
    });
  }

  private scheduleSave() {
    if (this.saveTimer || !this.sessionId) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      if (this.sessionId) void this.saveCaptions(this.sessionId).catch(() => this.onSync());
    }, 1500);
  }

  private async saveCaptions(sessionId: string): Promise<void> {
    if (this.saving) await this.saving;
    if (!this.pendingCaptions.size) return;
    const items = [...this.pendingCaptions.values()].slice(0, 20);
    for (const item of items) this.pendingCaptions.delete(item.itemId);
    this.saving = parseResponse(
      this.client.voice.conversation.$post(
        { json: { voiceSessionId: sessionId, items } },
        { init: { signal: AbortSignal.timeout(5000) } },
      ),
    ).then(() => this.onSync());
    try {
      await this.saving;
    } catch (error) {
      for (const item of items)
        if (!this.pendingCaptions.has(item.itemId)) this.pendingCaptions.set(item.itemId, item);
      throw error;
    } finally {
      this.saving = undefined;
    }
    if (this.pendingCaptions.size) await this.saveCaptions(sessionId);
  }

  private async registerDelegation(
    id: string | null,
    trigger: "user" | "proactive",
    attempt: number,
  ): Promise<string | undefined> {
    if (!this.current(attempt) || !this.sessionId) return undefined;
    try {
      const response = await this.client.voice.delegations.$post(
        {
          json: {
            voiceSessionId: this.sessionId,
            delegationId: id,
            locale: this.locale,
            messages: [],
            trigger,
          },
        },
        { init: { signal: AbortSignal.timeout(10000) } },
      );
      if (response.status === 204) return undefined;
      return (await parseResponse(response)).turnId;
    } catch {
      if (this.current(attempt)) this.onSync();
      return undefined;
    }
  }

  private async receiveResponse(envelope: z.infer<typeof responseEnvelope>, attempt: number) {
    const event = envelope.event;
    const id = envelope.delegation_id;
    if (!this.current(attempt)) return;
    if (event.type === "response.created") {
      this.responses.set(event.response.id, { calls: [], handled: false });
      this.responseIds.set(id, event.response.id);
      return;
    }
    if (event.type === "response.output_item.done") {
      const item = event.item;
      const pending = this.responses.get(event.response_id ?? this.responseIds.get(id) ?? "");
      if (
        pending &&
        item.type === "function_call" &&
        item.call_id &&
        item.name &&
        item.arguments &&
        !pending.calls.some((call) => call.callId === item.call_id)
      )
        pending.calls.push({ callId: item.call_id, name: item.name, arguments: item.arguments });
      return;
    }
    const pending = this.responses.get(event.response.id);
    if (!pending || pending.handled) return;
    pending.handled = true;
    const turnId = await this.delegations.get(id);
    if (!this.current(attempt) || this.activeDelegation !== id || !this.sessionId) return;
    if (!turnId) {
      // 登録失敗でもfunction結果を返し、backendを未応答toolの待機に残さない。
      for (const call of pending.calls)
        this.channel?.send(
          JSON.stringify({
            type: "response.item.create",
            event_id: crypto.randomUUID(),
            item: {
              type: "function_call_output",
              call_id: call.callId,
              output: JSON.stringify({ error: "VOICE_TURN_UNAVAILABLE" }),
            },
          }),
        );
      this.responses.delete(event.response.id);
      if (pending.calls.length)
        this.channel?.send(
          JSON.stringify({ type: "response.create", event_id: crypto.randomUUID() }),
        );
      else this.reportFailure();
      return;
    }
    const sessionId = this.sessionId;
    const controller = new AbortController();
    this.delegation = controller;
    try {
      if (event.type !== "response.completed" || pending.calls.length === 0) {
        await parseResponse(
          this.client.voice.finish.$post({
            json: {
              voiceSessionId: sessionId,
              turnId,
              status: event.type === "response.completed" ? "completed" : "failed",
            },
          }),
        );
        if (event.type !== "response.completed") this.reportFailure();
        return;
      }
      this.emit({ status: "thinking" });
      // 同じresponseの独立した読取だけを並列実行し、書込はモデルの順序を保つ。
      const execute = async (call: PendingResponse["calls"][number]) => {
        if (!this.current(attempt) || this.activeDelegation !== id || controller.signal.aborted)
          return;
        let output: unknown;
        try {
          const argumentsValue: unknown = JSON.parse(call.arguments);
          const tool = z
            .object({ toolName: voiceToolNameSchema, arguments: z.record(z.string(), z.unknown()) })
            .parse({ toolName: call.name, arguments: argumentsValue });
          const result = await parseResponse(
            this.client.voice.tools.$post(
              {
                json: {
                  voiceSessionId: sessionId,
                  turnId,
                  toolCallId: call.callId,
                  ...tool,
                },
              },
              {
                init: { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) },
              },
            ),
          );
          output = result.result;
        } catch (error) {
          output = { error: apiError(error)?.code ?? "VOICE_TOOL_FAILED" };
        }
        if (this.current(attempt) && this.activeDelegation === id && !controller.signal.aborted)
          this.channel?.send(
            JSON.stringify({
              type: "response.item.create",
              event_id: crypto.randomUUID(),
              item: {
                type: "function_call_output",
                call_id: call.callId,
                output: JSON.stringify(output),
              },
            }),
          );
      };
      let reads: Promise<void>[] = [];
      for (const call of pending.calls) {
        if (call.name === "getCatalog" || call.name === "getTableState") reads.push(execute(call));
        else {
          await Promise.all(reads);
          reads = [];
          await execute(call);
        }
      }
      await Promise.all(reads);
      if (this.current(attempt) && this.activeDelegation === id && !controller.signal.aborted)
        this.channel?.send(
          JSON.stringify({ type: "response.create", event_id: crypto.randomUUID() }),
        );
    } catch {
      if (this.current(attempt) && !controller.signal.aborted) this.reportFailure();
    } finally {
      this.responses.delete(event.response.id);
      if (this.delegation === controller) this.delegation = undefined;
      this.onSync();
      this.scheduleProactive(attempt);
    }
  }

  private reportFailure() {
    this.channel?.send(
      JSON.stringify({
        type: "session.commentary.append",
        event_id: crypto.randomUUID(),
        delegation_id: null,
        content:
          this.locale === "ja"
            ? "今回の処理は完了できませんでした。注文の状態は画面で確認できます。"
            : "That request could not be completed. The order status is available on the screen.",
      }),
    );
    this.emit({ status: "listening" });
  }

  private scheduleProactive(attempt: number) {
    clearTimeout(this.proactiveTimer);
    if (!this.proactive || !this.ready || !this.current(attempt)) return;
    this.proactiveTimer = setTimeout(() => {
      if (!this.delegation) void this.proactiveSuggestion(attempt);
    }, 180000);
  }

  private clearGuidance() {
    ++this.guidanceVersion;
    this.openingRequest?.abort();
    this.openingRequest = undefined;
    this.suggestionsRequest?.abort();
    this.suggestionsRequest = undefined;
    this.emit({ suggestions: [], openingFailed: false });
  }

  private async opening(attempt: number) {
    if (!this.sessionId || !this.current(attempt) || this.captions.length || this.activeDelegation)
      return;
    const controller = new AbortController();
    this.openingRequest = controller;
    const version = this.guidanceVersion;
    try {
      const response = await this.client.voice.opening.$post(
        { json: { voiceSessionId: this.sessionId } },
        { init: { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) } },
      );
      if (response.status === 204) return;
      const result = await parseResponse(Promise.resolve(response));
      if (
        !result ||
        !this.current(attempt) ||
        controller.signal.aborted ||
        version !== this.guidanceVersion ||
        result.locale !== this.locale
      )
        return;
      this.channel?.send(
        JSON.stringify({
          type: "session.commentary.append",
          event_id: crypto.randomUUID(),
          delegation_id: null,
          content: `音声接続の開始案内です。客の発話・依頼ではありません。次の検証済み案内を自然に話してください。業務操作や追加の提案はしません。${JSON.stringify(result.text)}`,
        }),
      );
    } catch {
      if (this.current(attempt) && !controller.signal.aborted && version === this.guidanceVersion)
        this.emit({ openingFailed: true });
    } finally {
      if (this.openingRequest === controller) this.openingRequest = undefined;
    }
  }

  private async suggestReplies(caption: Caption, attempt: number) {
    const sessionId = this.sessionId;
    if (!sessionId || !this.current(attempt) || caption.message.interrupted || this.delegation)
      return;
    const version = this.guidanceVersion;
    const text = caption.message.text;
    const controller = new AbortController();
    this.suggestionsRequest = controller;
    try {
      // APIが対象字幕を検証できるよう保存を待つ。音声の再生・次の発話は待たせない。
      await this.saveCaptions(sessionId);
      if (!this.current(attempt) || controller.signal.aborted || version !== this.guidanceVersion)
        return;
      const result = await parseResponse(
        this.client.voice.suggestions.$post(
          { json: { voiceSessionId: sessionId, itemId: caption.message.id, text } },
          { init: { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) } },
        ),
      );
      if (
        this.current(attempt) &&
        !controller.signal.aborted &&
        version === this.guidanceVersion &&
        result.locale === this.locale &&
        result.itemId === caption.message.id &&
        result.text === text
      )
        this.emit({ suggestions: result.suggestions });
    } catch {
      // 発話ヒントの失敗は音声接続を終了せず、次の案内から生成し直す。
    } finally {
      if (this.suggestionsRequest === controller) this.suggestionsRequest = undefined;
    }
  }

  private async proactiveSuggestion(attempt: number) {
    const delegationId = this.activeDelegation;
    const turnId = await this.registerDelegation(null, "proactive", attempt);
    if (!turnId || !this.sessionId || !this.current(attempt)) return;
    const sessionId = this.sessionId;
    try {
      const result = await parseResponse(
        this.client.voice.tools.$post({
          json: {
            voiceSessionId: sessionId,
            turnId,
            toolName: "getCatalog",
            toolCallId: crypto.randomUUID(),
            arguments: {},
          },
        }),
      );
      const catalog = z
        .object({
          products: z.array(
            z.object({
              displayName: z.string(),
              description: z.string(),
              price: z.number(),
              available: z.boolean(),
            }),
          ),
        })
        .parse(result.result);
      const product = catalog.products.find((item) => item.available);
      if (product && this.current(attempt) && this.activeDelegation === delegationId)
        this.channel?.send(
          JSON.stringify({
            type: "session.commentary.append",
            event_id: crypto.randomUUID(),
            delegation_id: null,
            content: `店舗が許可した自発接客です。次の登録商品の紹介を一文だけ伝えてください。注文操作はしません。${JSON.stringify(product)}`,
          }),
        );
      await parseResponse(
        this.client.voice.finish.$post({
          json: { voiceSessionId: sessionId, turnId, status: "completed" },
        }),
      );
    } catch {
      this.onSync();
    }
  }

  private async closeTransport(peer?: RTCPeerConnection, channel?: RTCDataChannel) {
    try {
      if (channel?.readyState === "open")
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timeout);
            channel.removeEventListener("message", received);
            channel.removeEventListener("close", finish);
            resolve();
          };
          const received = ({ data }: MessageEvent<unknown>) => {
            if (typeof data !== "string") return;
            try {
              const event: unknown = JSON.parse(data);
              if (
                event &&
                typeof event === "object" &&
                "type" in event &&
                event.type === "session.closed"
              )
                finish();
            } catch {
              /* 不正な通知で終了を確定しない。 */
            }
          };
          const timeout = setTimeout(finish, 1500);
          channel.addEventListener("message", received);
          channel.addEventListener("close", finish);
          channel.send(JSON.stringify({ type: "session.close" }));
        });
    } finally {
      channel?.close();
      peer?.close();
    }
  }

  private async fail(attempt: number) {
    if (!this.current(attempt)) return;
    await this.stop();
    this.emit({ status: "error", error: "connection" });
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
