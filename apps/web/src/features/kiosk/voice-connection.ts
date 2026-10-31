import {
  displayCurrencyActionSchema,
  type DisplayCurrencyContext,
  type Locale,
  voiceToolNameSchema,
} from "@tablecast/api/schema";
import { z } from "zod";
import { parseResponse, type TableClient, tableEndpoint } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import {
  type Caption,
  delegationEvent,
  type PendingResponse,
  responseEnvelope,
  type SavedCaption,
  transcriptEvent,
} from "./voice-events-model";
import {
  initialMicrophone,
  type MicrophoneError,
  type MicrophoneView,
  type VoiceCamera,
  type VoiceView,
} from "./voice-model";
import { VoiceObservations } from "./voice-observations";
import { observeVoiceActivity } from "./voice-runtime";
export type { VoiceStatus, VoiceView } from "./voice-model";
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
  private observations?: VoiceObservations;
  private desired = false;
  private ready = false;
  private stopping?: Promise<void>;
  private startingRequest?: AbortController;
  private delegation?: AbortController;
  private delegations = new Map<string, Promise<string | undefined>>();
  private delegationLocales = new Map<string, Locale>();
  private responses = new Map<string, PendingResponse>();
  private responseIds = new Map<string, string>();
  private activeDelegation?: string;
  private transcriptEvents = new Set<string>();
  private captions: Caption[] = [];
  private localeTranscriptFloor = { user: 0, assistant: 0 };
  private pendingCaptions = new Map<string, SavedCaption>();
  private saving?: Promise<void>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private proactiveTimer?: ReturnType<typeof setTimeout>;
  private proactive = false;
  private endingTimer?: ReturnType<typeof setTimeout>;
  private endingQuietTimer?: ReturnType<typeof setTimeout>;
  private ending = false;
  private activityObservers: (() => void)[] = [];
  private inputActivity?: () => void;
  private locale: Locale = "ja";
  private opening?: string;
  private assistanceContext?: string;
  private openingSent = false;
  private guidanceEnabled = false;
  private guidanceVersion = 0;
  private suggestionsRequest?: AbortController;
  private responseCommands = new Map<string, string>();
  private hasUserInput = false;
  private speechSpeed = 1;
  private requestedSpeechSpeed = 1;
  private camera?: VoiceCamera;
  private cameraRequest?: AbortController;
  private microphoneView = initialMicrophone;
  private deviceRequest = 0;
  private microphoneErrorSource?: "capture" | "devices";
  constructor(
    private onChange: (view: VoiceView) => void,
    private onSync: () => void,
    private client: TableClient = tableEndpoint.client,
    private displayCurrency?: {
      getContext?: () => DisplayCurrencyContext;
      setCurrency?: (
        currency: DisplayCurrencyContext["currency"],
        expectedRevision?: number,
      ) => boolean;
    },
  ) {}
  private listeners = new Set<() => void>();
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async start(
    locale: Locale,
    speechSpeed = 1,
    purpose: "assistance" | "conversation" = "conversation",
  ) {
    if (this.desired || this.stopping) return;
    this.desired = true;
    this.ready = false;
    this.locale = locale;
    this.openingSent = false;
    this.assistanceContext = undefined;
    this.hasUserInput = false;
    this.responseCommands.clear();
    this.clearGuidance();
    this.speechSpeed = speechSpeed;
    this.requestedSpeechSpeed = speechSpeed;
    this.captions = [];
    this.localeTranscriptFloor = { user: 0, assistant: 0 };
    this.pendingCaptions.clear();
    this.delegations.clear();
    this.delegationLocales.clear();
    this.responses.clear();
    this.responseIds.clear();
    this.activeDelegation = undefined;
    this.transcriptEvents.clear();
    const attempt = ++this.attempt;
    this.emit({ status: "connecting", messages: [] });
    try {
      const transport = await this.openTransport(attempt);
      if (!transport) return;
      const { peer, sdp } = transport;
      const controller = new AbortController();
      this.startingRequest = controller;
      const created = await parseResponse(
        this.client.voice.start.$post(
          { json: { sdp, ...(purpose === "assistance" ? { purpose } : {}) } },
          { init: { signal: controller.signal } },
        ),
      );
      if (this.startingRequest === controller) this.startingRequest = undefined;
      if (!this.current(attempt)) {
        await this.retire(created.voiceSessionId);
        return;
      }
      this.sessionId = created.voiceSessionId;
      this.observations = created.diagnostics?.enabled
        ? new VoiceObservations(
            this.client,
            created.voiceSessionId,
            created.diagnostics.captureContent,
          )
        : undefined;
      this.proactive = created.proactive;
      this.opening = created.opening;
      this.guidanceEnabled = created.guidance;
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
      if (error instanceof DOMException)
        this.updateMicrophone({ error: this.microphoneError(error) });
      this.emit({ status: "error", error: reason });
    }
  }
  requestAssistance(topic?: string) {
    if (!this.desired) return;
    const content = topic
      ? `利用客が用件ボタンで次の項目を選びました: ${JSON.stringify(topic)}。getServiceGuidanceで登録案内と関連商品を確認し、現在言語で短く説明します。ボタン操作は注文や人の呼び出しの承認ではありません。`
      : "利用客が店員への用件相談を開きました。用件が不明なら一度だけ尋ね、既に分かっていれば登録案内と関連商品を確認します。今回の操作自体では店員を呼ばず、注文も行いません。";
    if (!this.ready) {
      this.assistanceContext = content;
      return;
    }
    this.channel?.send(
      JSON.stringify({
        type: "session.commentary.append",
        event_id: crypto.randomUUID(),
        delegation_id: null,
        content,
      }),
    );
  }
  synchronise(
    sessionId: null | string,
    active: boolean,
    speechSpeed: number,
    locale = this.locale,
  ) {
    this.requestedSpeechSpeed = speechSpeed;
    if (this.sessionId && (!active || this.sessionId !== sessionId))
      void this.stop({ serverStopped: true });
    else if (this.sessionId === sessionId && active) {
      this.updateSpeechSpeed();
      this.updateLocale(locale);
    }
  }
  connectCamera(camera: VoiceCamera) {
    this.camera = camera;
    return () => {
      if (this.camera !== camera) return;
      this.cameraRequest?.abort();
      camera.complete();
      this.camera = undefined;
    };
  }
  clearCustomerContext() {
    this.observations?.cancel();
    this.observations = undefined;
    void this.stop({ serverStopped: true });
    for (const caption of this.captions) clearTimeout(caption.timer);
    this.captions = [];
    this.pendingCaptions.clear();
    this.transcriptEvents.clear();
    this.emit({ messages: [] });
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
    this.ending = false;
    this.clearGuidance();
    this.emit({ progress: undefined, citations: [] });
    this.cameraRequest?.abort();
    this.camera?.complete();
    clearTimeout(this.endingTimer);
    clearTimeout(this.endingQuietTimer);
    this.activityObservers.forEach((dispose) => dispose());
    this.activityObservers = [];
    this.inputActivity?.();
    this.inputActivity = undefined;
    ++this.attempt;
    this.startingRequest?.abort();
    this.startingRequest = undefined;
    this.delegation?.abort();
    this.delegation = undefined;
    this.responseCommands.clear();
    clearTimeout(this.proactiveTimer);
    clearTimeout(this.readyTimer);
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    for (const caption of this.captions) {
      clearTimeout(caption.timer);
      if (!caption.message.final) this.finishCaption(caption, caption.message.role === "assistant");
    }
    this.emit({
      status: "stopping",
      messages: this.captions.map((row) => row.message),
    });
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
          const observations = this.observations;
          this.observations = undefined;
          if (serverStopped) observations?.cancel();
          else if (observations) void observations.flush().finally(() => observations.cancel());
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
    for (const listener of this.listeners) listener();
  }
  private current(attempt: number) {
    return this.desired && this.attempt === attempt;
  }
  private async retire(voiceSessionId?: string) {
    await parseResponse(
      this.client.voice.stop.$post({ json: voiceSessionId ? { voiceSessionId } : {} }),
    );
  }
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
        this.updateMicrophone({ loading: false, error: this.microphoneError(error) }, "devices");
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
      if (!track) throw new DOMException("Microphone has no audio track", "NotFoundError");
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
      this.updateMicrophone({ error: this.microphoneError(error) });
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
    if (deviceId !== "default" && stream.getAudioTracks()[0]?.getSettings().deviceId !== deviceId) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException("Microphone selection was not applied", "NotSupportedError");
    }
    return stream;
  }
  private observeMicrophone(stream: MediaStream, attempt: number) {
    this.inputActivity?.();
    const track = stream.getAudioTracks()[0];
    this.inputActivity = track
      ? observeVoiceActivity(track, () => this.audioActivity(attempt, false))
      : undefined;
    stream.getAudioTracks()[0]?.addEventListener(
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
    errorSource: "capture" | "devices" = "capture",
  ) {
    if ("error" in change) this.microphoneErrorSource = change.error ? errorSource : undefined;
    this.microphoneView = { ...this.microphoneView, ...change };
    this.emit({ microphone: this.microphoneView });
  }
  private microphoneError(error: unknown): MicrophoneError {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError" || error.name === "SecurityError") return "permission";
      if (error.name === "NotSupportedError") return "unsupported";
      if (error.name === "NotFoundError") return "empty";
      if (error.name === "OverconstrainedError") return "disconnected";
    }
    return "failed";
  }
  private receiveCaption(event: z.infer<typeof transcriptEvent>, attempt: number) {
    if (this.transcriptEvents.has(event.event_id) || event.end_ms < event.start_ms || !event.delta)
      return;
    this.transcriptEvents.add(event.event_id);
    const role = event.type === "session.input_transcript.delta" ? "user" : "assistant";
    if (event.start_ms < this.localeTranscriptFloor[role]) return;
    this.clearGuidance();
    if (role === "user") {
      this.hasUserInput = true;
      this.emit({ progress: undefined, citations: [] });
    } else this.camera?.complete();
    // 字幕のまとまりは表示だけに使い、委任開始や業務の中断条件には使わない。
    let caption = this.captions.findLast(
      (row) =>
        row.message.role === role &&
        row.message.locale === this.locale &&
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
      if (current.message.role === "assistant") void this.suggestReplies(current, attempt);
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
    this.observations?.append({
      eventId: `${caption.message.id}:${caption.message.text.length}:${interrupted}`,
      kind: "transcript",
      startedAt: Date.now(),
      endedAt: Date.now(),
      content: caption.message.text.slice(0, 16000),
      role: caption.message.role,
      status: interrupted ? "interrupted" : "completed",
    });
    this.pendingCaptions.set(caption.message.id, {
      itemId: caption.message.id,
      locale: caption.message.locale,
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
    id: null | string,
    trigger: "opening" | "proactive" | "user",
    attempt: number,
  ): Promise<string | undefined> {
    if (!this.current(attempt) || !this.sessionId) return undefined;
    if (id) this.delegationLocales.set(id, this.locale);
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
      const turnId = (await parseResponse(response)).turnId;
      if (id) this.observations?.bindTurn(id, turnId);
      const now = Date.now();
      this.observations?.append({
        eventId: id ?? turnId,
        kind: "delegation",
        startedAt: now,
        endedAt: now,
        turnId,
        delegationId: id ?? undefined,
      });
      return turnId;
    } catch {
      if (this.current(attempt)) this.onSync();
      return undefined;
    }
  }
  private continueResponse(delegationId: string) {
    const eventId = crypto.randomUUID();
    this.responseCommands.set(eventId, delegationId);
    this.channel?.send(JSON.stringify({ type: "response.create", event_id: eventId }));
  }
  private async receiveResponse(envelope: z.infer<typeof responseEnvelope>, attempt: number) {
    const event = envelope.event;
    const commandOwner = envelope.client_event_id
      ? this.responseCommands.get(envelope.client_event_id)
      : undefined;
    const responseId = "response" in event ? event.response.id : event.response_id;
    const currentResponse = this.responses.get(
      responseId ?? this.responseIds.get(commandOwner ?? envelope.delegation_id ?? "") ?? "",
    );
    const id = currentResponse?.delegationId ?? commandOwner ?? envelope.delegation_id;
    if (!this.current(attempt)) return;
    if (!id || !this.delegations.has(id)) return;
    if (event.type === "response.created") {
      if (id !== this.activeDelegation) return;
      this.responses.set(event.response.id, {
        calls: [],
        delegationId: id,
        handled: false,
        locale: this.delegationLocales.get(id) ?? this.locale,
      });
      if (
        this.activeDelegation === id &&
        (this.delegationLocales.get(id) ?? this.locale) === this.locale
      )
        this.emit({ progress: { stage: "thinking", summary: this.view.progress?.summary ?? "" } });
      this.responseIds.set(id, event.response.id);
      return;
    }
    const showProgress =
      Boolean(currentResponse && !currentResponse.handled) &&
      this.activeDelegation === id &&
      (currentResponse?.locale ?? this.delegationLocales.get(id) ?? this.locale) === this.locale;
    if (event.type === "response.reasoning_summary_text.delta") {
      if (showProgress)
        this.emit({
          progress: {
            stage: this.view.progress?.stage ?? "thinking",
            summary: ((this.view.progress?.summary ?? "") + event.delta).slice(0, 10000),
          },
        });
      return;
    }
    if (event.type === "response.output_text.annotation.added") {
      if (showProgress) this.addCitation(event.annotation.url, event.annotation.title);
      return;
    }
    if (
      event.type === "response.web_search_call.in_progress" ||
      event.type === "response.web_search_call.searching" ||
      event.type === "response.web_search_call.completed"
    ) {
      if (showProgress)
        this.emit({
          progress: {
            stage: event.type === "response.web_search_call.completed" ? "thinking" : "searching",
            summary: this.view.progress?.summary ?? "",
          },
        });
      return;
    }
    if (event.type === "response.output_item.done" || event.type === "response.output_item.added") {
      const item = event.item;
      if (showProgress) {
        if (item.type === "reasoning" && item.summary?.length)
          this.emit({
            progress: {
              stage: this.view.progress?.stage ?? "thinking",
              summary: item.summary
                .map((part) => part.text)
                .join("\n")
                .slice(0, 10000),
            },
          });
        for (const content of item.content ?? [])
          for (const annotation of content.annotations ?? [])
            if (annotation.type === "url_citation" && annotation.url)
              this.addCitation(annotation.url, annotation.title ?? annotation.url);
      }
      const pending = this.responses.get(event.response_id ?? this.responseIds.get(id) ?? "");
      if (
        pending &&
        event.type === "response.output_item.done" &&
        item.type === "function_call" &&
        item.call_id &&
        item.name &&
        item.arguments &&
        !pending.calls.some((call) => call.callId === item.call_id)
      )
        pending.calls.push({ callId: item.call_id, name: item.name, arguments: item.arguments });
      return;
    }
    if (!("response" in event)) return;
    const pending = this.responses.get(event.response.id);
    if (!pending || pending.handled) return;
    pending.handled = true;
    const turnId = await this.delegations.get(id);
    if (!this.current(attempt) || this.activeDelegation !== id || !this.sessionId) {
      this.responses.delete(event.response.id);
      return;
    }
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
      if (pending.calls.length) this.continueResponse(id);
      else this.reportFailure();
      return;
    }
    const sessionId = this.sessionId;
    const controller = new AbortController();
    this.delegation = controller;
    try {
      if (event.type !== "response.completed" || pending.calls.length === 0) {
        this.camera?.complete();
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
      let controlAction = false;
      const execute = async (call: PendingResponse["calls"][number]) => {
        if (!this.current(attempt) || this.activeDelegation !== id || controller.signal.aborted)
          return;
        let output: unknown;
        let sessionAuthorized = false;
        try {
          if (controlAction || this.ending || pending.locale !== this.locale)
            throw new Error("Previous language or conversation has ended");
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
                  displayCurrency: this.displayCurrency?.getContext?.(),
                },
              },
              {
                init: { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) },
              },
            ),
          );
          if (!this.current(attempt) || this.activeDelegation !== id || controller.signal.aborted)
            return;
          sessionAuthorized = true;
          output = result.result;
          if (tool.toolName === "getCameraState") {
            output = {
              sessionAuthorized: true,
              camera: this.camera?.getState?.() ?? { status: "unavailable" },
            };
          }
          if (result.cameraAction === "capture") {
            this.emit({
              progress: { stage: "reading", summary: this.view.progress?.summary ?? "" },
            });
            if (pending.locale !== this.locale) throw new Error("Stale camera request");
            const question = z.object({ question: z.string() }).parse(result.result).question;
            const maxBytes = Math.min(this.peer?.sctp?.maxMessageSize || 64000, 64000);
            const cameraRequest = new AbortController();
            this.cameraRequest = cameraRequest;
            const captured = (await this.camera?.capture(
              AbortSignal.any([controller.signal, cameraRequest.signal]),
              Math.max(0, maxBytes - 2048),
            )) ?? { error: "CAMERA_UNAVAILABLE" };
            if (
              !this.current(attempt) ||
              this.activeDelegation !== id ||
              controller.signal.aborted ||
              cameraRequest.signal.aborted ||
              pending.locale !== this.locale
            )
              return;
            if ("error" in captured) {
              output = captured;
              this.camera?.complete();
            } else {
              const imageEvent = JSON.stringify({
                type: "response.item.create",
                event_id: crypto.randomUUID(),
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    { type: "input_text", text: question },
                    { type: "input_image", image_url: captured.imageUrl, detail: "auto" },
                  ],
                },
              });
              if (new TextEncoder().encode(imageEvent).byteLength > maxBytes)
                output = { error: "CAMERA_IMAGE_TOO_LARGE" };
              else {
                this.channel?.send(imageEvent);
                output = { captured: true };
              }
            }
            if (this.cameraRequest === cameraRequest) this.cameraRequest = undefined;
            output = {
              ...z.record(z.string(), z.unknown()).parse(output),
              sessionAuthorized: true,
              camera: this.camera?.getState?.() ?? { status: "unavailable" },
            };
          }
          if (result.conversationAction === "language" && result.locale) {
            this.updateLocale(result.locale);
            controlAction = true;
          } else if (result.conversationAction === "end") {
            this.requestEnd(attempt);
            controlAction = true;
          } else if (pending.locale !== this.locale) output = { error: "VOICE_LOCALE_STALE" };
          if (
            result.displayCurrencyAction &&
            this.current(attempt) &&
            this.activeDelegation === id &&
            !controller.signal.aborted
          ) {
            const action = displayCurrencyActionSchema.parse(result.displayCurrencyAction);
            if (!this.displayCurrency?.setCurrency?.(action.currency, action.revision))
              output = { error: "DISPLAY_CURRENCY_CHANGED" };
          }
        } catch (error) {
          if (call.name === "captureCamera") {
            this.cameraRequest = undefined;
            this.camera?.complete();
          }
          output = {
            error: apiError(error)?.code ?? "VOICE_TOOL_FAILED",
            ...(["captureCamera", "getCameraState"].includes(call.name)
              ? {
                  sessionAuthorized,
                  camera: this.camera?.getState?.() ?? { status: "unavailable" },
                }
              : {}),
          };
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
      if (
        this.current(attempt) &&
        this.activeDelegation === id &&
        !controller.signal.aborted &&
        !this.ending
      )
        this.continueResponse(id);
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
            ? "処理の結果を確認できませんでした。スタッフをお呼びしましょうか。"
            : "I could not confirm the result. Would you like me to call a member of staff?",
      }),
    );
    this.emit({ status: "listening" });
  }
  private scheduleProactive(attempt: number) {
    clearTimeout(this.proactiveTimer);
    if (!this.proactive || !this.ready || !this.current(attempt) || this.ending) return;
    this.proactiveTimer = setTimeout(() => {
      if (
        !this.delegation &&
        this.responses.size === 0 &&
        this.view.status === "listening" &&
        !this.ending
      )
        void this.proactiveSuggestion(attempt);
      else this.scheduleProactive(attempt);
    }, 30000);
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
  private addCitation(url: string, title: string) {
    if (!url.startsWith("https://")) return;
    const current = this.view.citations ?? [];
    if (current.some((citation) => citation.url === url) || current.length >= 8) return;
    this.emit({ citations: [...current, { url, title: title.slice(0, 200) }] });
  }
  private clearGuidance() {
    ++this.guidanceVersion;
    this.suggestionsRequest?.abort();
    this.suggestionsRequest = undefined;
    this.emit({ suggestions: [] });
  }
  private async suggestReplies(caption: Caption, attempt: number) {
    if (
      !this.guidanceEnabled ||
      !this.sessionId ||
      !this.current(attempt) ||
      this.ending ||
      caption.message.interrupted
    )
      return;
    const voiceSessionId = this.sessionId;
    const version = this.guidanceVersion;
    const text = caption.message.text;
    const locale = this.locale;
    const controller = new AbortController();
    this.suggestionsRequest = controller;
    try {
      await this.saveCaptions(voiceSessionId);
      if (controller.signal.aborted || !this.current(attempt) || version !== this.guidanceVersion)
        return;
      const result = await parseResponse(
        this.client.voice.suggestions.$post(
          {
            json: {
              voiceSessionId,
              locale,
              itemId: caption.message.id,
              text,
            },
          },
          { init: { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) } },
        ),
      );
      if (
        !controller.signal.aborted &&
        this.current(attempt) &&
        version === this.guidanceVersion &&
        locale === this.locale &&
        result.itemId === caption.message.id &&
        result.text === text
      )
        this.emit({ suggestions: result.suggestions });
    } catch {
      /* 候補生成の失敗で音声を停止しない。 */
    } finally {
      if (this.suggestionsRequest === controller) this.suggestionsRequest = undefined;
    }
  }
  async sendSuggestion(text: string, source: string[] | undefined) {
    if (
      !this.ready ||
      !this.desired ||
      this.ending ||
      !this.sessionId ||
      source !== this.view.suggestions ||
      !source?.includes(text) ||
      this.delegation ||
      this.responses.size ||
      this.view.status !== "listening"
    )
      return;
    const attempt = this.attempt;
    const locale = this.locale;
    const sessionId = this.sessionId;
    this.clearGuidance();
    const version = this.guidanceVersion;
    const itemId = crypto.randomUUID();
    this.hasUserInput = true;
    const caption: Caption = {
      message: {
        id: itemId,
        turnId: itemId,
        role: "user",
        text,
        final: true,
        locale,
        createdAt: Date.now(),
      },
      start: 0,
      end: 0,
      fragments: [],
    };
    this.captions.push(caption);
    this.finishCaption(caption, false);
    this.emit({ status: "thinking", messages: this.captions.map((row) => row.message) });
    try {
      await this.saveCaptions(sessionId);
      if (!this.current(attempt) || locale !== this.locale || version !== this.guidanceVersion)
        return;
      const id = `tablecast-input-${itemId}`;
      this.activeDelegation = id;
      const registered = this.registerDelegation(id, "user", attempt);
      this.delegations.set(id, registered);
      if (!(await registered) || !this.current(attempt) || version !== this.guidanceVersion) return;
      this.channel?.send(
        JSON.stringify({
          type: "response.item.create",
          event_id: itemId,
          item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
        }),
      );
      this.continueResponse(id);
    } catch {
      if (this.current(attempt)) this.reportFailure();
    }
  }
  private updateLocale(locale: Locale) {
    if (locale === this.locale || !this.ready || !this.desired) return;
    for (const caption of this.captions) {
      this.localeTranscriptFloor[caption.message.role] = Math.max(
        this.localeTranscriptFloor[caption.message.role],
        caption.end,
      );
      if (!caption.message.final) this.finishCaption(caption, true);
    }
    this.locale = locale;
    this.emit({
      progress: undefined,
      citations: [],
      messages: this.captions.map((caption) => caption.message),
    });
    this.scheduleSave();
    this.cameraRequest?.abort();
    this.camera?.complete();
    this.clearGuidance();
    this.channel?.send(
      JSON.stringify({
        type: "session.instructions.append",
        event_id: crypto.randomUUID(),
        delegation_id: null,
        content: `会話言語は${locale === "ja" ? "日本語" : "British English"}です。次の発話から使い、古い言語の注文確認を再利用しないでください。`,
      }),
    );
    this.scheduleProactive(this.attempt);
  }
  private audioActivity(attempt: number, output: boolean) {
    if (!this.current(attempt)) return;
    this.scheduleProactive(attempt);
    if (this.ending && output) {
      clearTimeout(this.endingQuietTimer);
      this.endingQuietTimer = setTimeout(() => void this.stop(), 1000);
    }
  }
  private requestEnd(attempt: number) {
    if (!this.current(attempt) || this.ending) return;
    this.ending = true;
    this.clearGuidance();
    clearTimeout(this.proactiveTimer);
    this.channel?.send(
      JSON.stringify({
        type: "session.commentary.append",
        event_id: crypto.randomUUID(),
        delegation_id: null,
        content:
          this.locale === "ja"
            ? "接客を終了します。承知しました、と一言だけ挨拶してください。"
            : "The guest has finished. Say only: Certainly. Thank you.",
      }),
    );
    this.endingTimer = setTimeout(() => void this.stop(), 5000);
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
  private async openTransport(attempt: number) {
    const peer = new RTCPeerConnection();
    this.peer = peer;
    const audio = new Audio();
    audio.autoplay = true;
    this.audio = audio;
    peer.addEventListener("track", ({ track }) => {
      if (!this.current(attempt) || track.kind !== "audio") return;
      audio.srcObject = new MediaStream([track]);
      this.emit({ outputTrack: track });
      this.activityObservers.push(
        observeVoiceActivity(track, () => this.audioActivity(attempt, true)),
      );
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
      this.observations?.receive(event);
      if (event.type === "session.started") {
        clearTimeout(this.readyTimer);
        this.ready = true;
        this.emit({ status: "listening" });
        this.updateSpeechSpeed();
        const opening = this.assistanceContext ?? this.opening;
        this.assistanceContext = undefined;
        if (!this.openingSent && opening) {
          this.openingSent = true;
          this.channel?.send(
            JSON.stringify({
              type: "session.commentary.append",
              event_id: crypto.randomUUID(),
              delegation_id: null,
              content: opening,
            }),
          );
        }
        this.scheduleProactive(attempt);
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
              if (this.ending) return;
              this.clearGuidance();
              this.cameraRequest?.abort();
              this.camera?.complete();
              this.responses.clear();
              this.responseIds.clear();
              this.emit({
                status: "thinking",
                progress: { stage: "thinking", summary: "" },
                citations: [],
              });
              clearTimeout(this.proactiveTimer);
              this.activeDelegation = id;
              this.delegation?.abort();
              this.delegation = undefined;
              this.delegations.set(
                id,
                this.registerDelegation(
                  id,
                  this.hasUserInput || !this.guidanceEnabled ? "user" : "opening",
                  attempt,
                ),
              );
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
      return undefined;
    }
    this.microphone = microphone;
    const track = microphone.getAudioTracks()[0];
    if (!track) throw new DOMException("Microphone has no audio track", "NotFoundError");
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
    if (!this.current(attempt)) return undefined;
    const sdp = peer.localDescription?.sdp;
    if (!sdp) throw new Error("音声接続候補を取得できなかった");

    return { peer, sdp };
  }
}
