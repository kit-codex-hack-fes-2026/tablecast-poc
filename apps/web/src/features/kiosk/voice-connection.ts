import type { Locale } from "@tablecast/api/schema";
import { parseResponse, type TableClient, tableEndpoint } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { receiveResponse, registerDelegation, reportFailure } from "./voice-delegation";
import {
  captureMicrophone,
  microphoneError,
  observeMicrophone,
  observeMicrophones,
  refreshMicrophones,
  selectMicrophone,
  updateMicrophone,
} from "./voice-microphone";
import { type VoiceView } from "./voice-model";
import { proactiveSuggestion, scheduleProactive } from "./voice-proactive";
import { VoiceRuntime } from "./voice-runtime";
import { finishCaption, receiveCaption, saveCaptions, scheduleSave } from "./voice-transcript";
import { closeTransport, openTransport, updateSpeechSpeed } from "./voice-transport";
export type { VoiceStatus, VoiceView } from "./voice-model";
export class VoiceConnection {
  private runtime: VoiceRuntime;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.runtime.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  constructor(
    onChange: (view: VoiceView) => void,
    onSync: () => void,
    client: TableClient = tableEndpoint.client,
  ) {
    this.runtime = new VoiceRuntime(onChange, onSync, client);
    this.runtime.observeMicrophones = (...args) => observeMicrophones(this.runtime, ...args);
    this.runtime.refreshMicrophones = (...args) => refreshMicrophones(this.runtime, ...args);
    this.runtime.selectMicrophone = (...args) => selectMicrophone(this.runtime, ...args);
    this.runtime.captureMicrophone = (...args) => captureMicrophone(this.runtime, ...args);
    this.runtime.observeMicrophone = (...args) => observeMicrophone(this.runtime, ...args);
    this.runtime.updateMicrophone = (...args) => updateMicrophone(this.runtime, ...args);
    this.runtime.updateSpeechSpeed = (...args) => updateSpeechSpeed(this.runtime, ...args);
    this.runtime.stop = this.stop.bind(this);
    this.runtime.receiveCaption = (...args) => receiveCaption(this.runtime, ...args);
    this.runtime.finishCaption = (...args) => finishCaption(this.runtime, ...args);
    this.runtime.scheduleSave = (...args) => scheduleSave(this.runtime, ...args);
    this.runtime.saveCaptions = (...args) => saveCaptions(this.runtime, ...args);
    this.runtime.registerDelegation = (...args) => registerDelegation(this.runtime, ...args);
    this.runtime.receiveResponse = (...args) => receiveResponse(this.runtime, ...args);
    this.runtime.reportFailure = (...args) => reportFailure(this.runtime, ...args);
    this.runtime.scheduleProactive = (...args) => scheduleProactive(this.runtime, ...args);
    this.runtime.proactiveSuggestion = (...args) => proactiveSuggestion(this.runtime, ...args);
    this.runtime.closeTransport = (...args) => closeTransport(this.runtime, ...args);
    this.runtime.fail = this.fail.bind(this);
    this.runtime.emit = this.emit.bind(this);
    this.runtime.current = this.current.bind(this);
    this.runtime.retire = this.retire.bind(this);
  }
  observeMicrophones(...args: Parameters<VoiceRuntime["observeMicrophones"]>) {
    return this.runtime.observeMicrophones(...args);
  }
  refreshMicrophones(...args: Parameters<VoiceRuntime["refreshMicrophones"]>) {
    return this.runtime.refreshMicrophones(...args);
  }
  selectMicrophone(...args: Parameters<VoiceRuntime["selectMicrophone"]>) {
    return this.runtime.selectMicrophone(...args);
  }
  async start(locale: Locale, speechSpeed = 1) {
    if (this.runtime.desired || this.runtime.stopping) return;
    this.runtime.desired = true;
    this.runtime.ready = false;
    this.runtime.locale = locale;
    this.runtime.speechSpeed = speechSpeed;
    this.runtime.requestedSpeechSpeed = speechSpeed;
    this.runtime.captions = [];
    this.runtime.pendingCaptions.clear();
    this.runtime.delegations.clear();
    this.runtime.responses.clear();
    this.runtime.responseIds.clear();
    this.runtime.activeDelegation = undefined;
    this.runtime.transcriptEvents.clear();
    const attempt = ++this.runtime.attempt;
    this.runtime.emit({ status: "connecting", messages: [] });
    try {
      const transport = await openTransport(this.runtime, attempt);
      if (!transport) return;
      const { peer, sdp } = transport;
      const controller = new AbortController();
      this.runtime.startingRequest = controller;
      const created = await parseResponse(
        this.runtime.client.voice.start.$post(
          { json: { sdp } },
          { init: { signal: controller.signal } },
        ),
      );
      if (this.runtime.startingRequest === controller) this.runtime.startingRequest = undefined;
      if (!this.runtime.current(attempt)) {
        await this.runtime.retire(created.voiceSessionId);
        return;
      }
      this.runtime.sessionId = created.voiceSessionId;
      this.runtime.proactive = created.proactive;
      await peer.setRemoteDescription({ type: "answer", sdp: created.sdp });
      if (this.runtime.current(attempt) && !this.runtime.ready)
        this.runtime.readyTimer = setTimeout(() => void this.runtime.fail(attempt), 15000);
    } catch (error) {
      if (!this.runtime.current(attempt)) return;
      const reason =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "permission"
          : apiError(error)?.code === "VOICE_ALREADY_ACTIVE"
            ? "active"
            : apiError(error)?.status === 503
              ? "unconfigured"
              : "connection";
      await this.runtime.stop();
      if (error instanceof DOMException)
        this.runtime.updateMicrophone({ error: microphoneError(error) });
      this.runtime.emit({ status: "error", error: reason });
    }
  }

  synchronise(sessionId: null | string, active: boolean, speechSpeed: number) {
    this.runtime.requestedSpeechSpeed = speechSpeed;
    if (this.runtime.sessionId && (!active || this.runtime.sessionId !== sessionId))
      void this.runtime.stop({ serverStopped: true });
    else if (this.runtime.sessionId === sessionId && active) this.runtime.updateSpeechSpeed();
  }

  clearCustomerContext() {
    void this.runtime.stop({ serverStopped: true });
    for (const caption of this.runtime.captions) clearTimeout(caption.timer);
    this.runtime.captions = [];
    this.runtime.pendingCaptions.clear();
    this.runtime.transcriptEvents.clear();
    this.runtime.emit({ messages: [] });
  }

  stop({
    existingSession = false,
    serverStopped = false,
  }: { existingSession?: boolean; serverStopped?: boolean } = {}): Promise<void> {
    if (this.runtime.stopping) return this.runtime.stopping;
    if (
      !existingSession &&
      !this.runtime.desired &&
      !this.runtime.peer &&
      !this.runtime.microphone &&
      !this.runtime.sessionId
    )
      return Promise.resolve();
    this.runtime.desired = false;
    this.runtime.ready = false;
    ++this.runtime.attempt;
    this.runtime.startingRequest?.abort();
    this.runtime.startingRequest = undefined;
    this.runtime.delegation?.abort();
    this.runtime.delegation = undefined;
    clearTimeout(this.runtime.proactiveTimer);
    clearTimeout(this.runtime.readyTimer);
    clearTimeout(this.runtime.saveTimer);
    this.runtime.saveTimer = undefined;
    for (const caption of this.runtime.captions) {
      clearTimeout(caption.timer);
      if (!caption.message.final)
        this.runtime.finishCaption(caption, caption.message.role === "assistant");
    }
    this.runtime.emit({
      status: "stopping",
      messages: this.runtime.captions.map((row) => row.message),
    });
    this.runtime.microphone?.getTracks().forEach((track) => track.stop());
    this.runtime.microphone = undefined;
    this.runtime.microphoneSender = undefined;
    this.runtime.switchingMicrophone?.getTracks().forEach((track) => track.stop());
    this.runtime.switchingMicrophone = undefined;
    if (this.runtime.view.microphone)
      this.runtime.updateMicrophone({ activeLabel: undefined, switching: false });
    this.runtime.audio?.pause();
    if (this.runtime.audio) this.runtime.audio.srcObject = null;
    this.runtime.audio = undefined;
    const peer = this.runtime.peer;
    const channel = this.runtime.channel;
    const sessionId = this.runtime.sessionId;
    this.runtime.peer = undefined;
    this.runtime.channel = undefined;
    this.runtime.stopping = Promise.allSettled([
      this.runtime.closeTransport(peer, channel),
      (async () => {
        try {
          if (!serverStopped && sessionId) await this.runtime.saveCaptions(sessionId);
        } finally {
          if (!serverStopped && (sessionId || existingSession))
            await this.runtime.retire(sessionId);
        }
      })(),
    ])
      .then((results) => {
        this.runtime.sessionId = undefined;
        this.runtime.emit(
          results.some((result) => result.status === "rejected")
            ? { status: "error", error: "connection" }
            : { status: "paused" },
        );
        this.runtime.onSync();
      })
      .finally(() => {
        this.runtime.stopping = undefined;
      });
    return this.runtime.stopping;
  }

  private async fail(attempt: number) {
    if (!this.runtime.current(attempt)) return;
    await this.runtime.stop();
    this.runtime.emit({ status: "error", error: "connection" });
  }

  private emit(change: Partial<VoiceView>) {
    this.runtime.view = { ...this.runtime.view, ...change };
    if (change.status === "connecting") this.runtime.view.error = undefined;
    if (["stopping", "paused", "error"].includes(change.status ?? "")) {
      this.runtime.view.inputTrack = undefined;
      this.runtime.view.outputTrack = undefined;
      this.runtime.view.messages = this.runtime.view.messages?.map((message) =>
        message.final ? message : { ...message, final: true, interrupted: true },
      );
    }
    this.runtime.onChange(this.runtime.view);
    for (const listener of this.listeners) listener();
  }

  private current(attempt: number) {
    return this.runtime.desired && this.runtime.attempt === attempt;
  }

  private async retire(voiceSessionId?: string) {
    await parseResponse(
      this.runtime.client.voice.stop.$post({ json: voiceSessionId ? { voiceSessionId } : {} }),
    );
  }
}
