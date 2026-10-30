import type { Locale } from "@tablecast/api/schema";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { LocalStandby } from "./standby-capture";
import type { StandbyStatus } from "./standby-model";
import type { VoiceConnection } from "./voice-connection";
import { wakeLocale } from "./standby-model";

type StandbyContext = {
  changeLanguage: (locale: Locale) => Promise<unknown>;
  disabled: boolean;
  languages: readonly Locale[];
  locale: Locale;
  speechSpeed: number;
};

const loadStandby = createClientOnlyFn(() => import("./standby-capture"));

class StandbyController {
  private status: StandbyStatus = "off";
  private listeners = new Set<() => void>();
  private runtime?: LocalStandby;
  private enabled = false;
  private attempted = false;
  private observing = false;
  private generation = 0;
  private context?: StandbyContext;
  constructor(private voice: VoiceConnection) {}
  getSnapshot = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  configure(context: StandbyContext) {
    if (this.context?.locale !== context.locale && ["armed", "preparing"].includes(this.status))
      this.disable();
    this.context = context;
    if (context.disabled) {
      if (this.enabled) this.disable();
    } else this.startAutomatically();
  }
  private emit(status: StandbyStatus) {
    this.status = status;
    for (const listener of this.listeners) listener();
  }
  disable = () => {
    this.attempted = true;
    this.enabled = false;
    this.generation++;
    void this.runtime?.stop();
    this.emit("off");
  };
  private async arm() {
    const version = ++this.generation;
    this.emit("preparing");
    try {
      const { LocalStandby: Capture } = await loadStandby();
      if (!this.enabled || version !== this.generation) return;
      const capture = new Capture(
        (next) => {
          if (version !== this.generation) return;
          this.emit(next);
          if (next === "error") this.enabled = false;
        },
        async (activation, detectedLocale, microphone) => {
          let transferred = false;
          try {
            const current = () =>
              this.enabled &&
              version === this.generation &&
              !this.context?.disabled &&
              document.visibilityState === "visible";
            if (!current() || !this.context) return;
            const selected = this.context.locale;
            const next = wakeLocale(detectedLocale, selected, this.context.languages);
            if (!next) {
              this.disable();
              this.emit("language");
              return;
            }
            if (next !== selected) await this.context.changeLanguage(next);
            if (!current()) return;
            transferred = true;
            await this.voice.start(next, this.context.speechSpeed, "conversation", {
              activation,
              microphone,
            });
          } finally {
            if (!transferred) microphone.getTracks().forEach((track) => track.stop());
          }
        },
      );
      this.runtime = capture;
      await capture.start(undefined, this.voice.getSnapshot().microphone?.selectedId);
    } catch {
      if (version === this.generation) {
        this.enabled = false;
        this.emit("error");
      }
    }
  }
  observe() {
    this.observing = true;
    let previous = this.voice.getSnapshot().status;
    const unsubscribe = this.voice.subscribe(() => {
      const view = this.voice.getSnapshot();
      if (previous === view.status) return;
      previous = view.status;
      if (!this.enabled) return;
      if (["connecting", "listening", "thinking", "speaking"].includes(view.status)) {
        void this.runtime?.stop();
        this.emit("conversation");
      } else if (view.status === "paused") {
        if (view.returnToStandby && document.visibilityState === "visible") void this.arm();
        else this.disable();
      } else if (view.status === "error") {
        this.disable();
        this.emit("error");
      }
    });
    const visibility = () => {
      if (document.visibilityState === "visible") {
        this.startAutomatically();
        return;
      }
      if (!this.enabled) return;
      this.disable();
      this.emit("suspended");
      void this.voice.stop();
    };
    document.addEventListener("visibilitychange", visibility);
    this.startAutomatically();
    return () => {
      this.observing = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      this.disable();
      this.attempted = false;
    };
  }
  private startAutomatically() {
    if (
      !this.observing ||
      this.attempted ||
      !this.context ||
      this.context.disabled ||
      !["idle", "paused", "error"].includes(this.voice.getSnapshot().status) ||
      document.visibilityState !== "visible"
    )
      return;
    this.attempted = true;
    this.enabled = true;
    void this.arm();
  }
}

export function useStandby({ voice, ...context }: StandbyContext & { voice: VoiceConnection }) {
  const [controller] = useState(() => new StandbyController(voice));
  const status = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { locale, languages, speechSpeed, changeLanguage, disabled } = context;
  useLayoutEffect(
    () => controller.configure({ locale, languages, speechSpeed, changeLanguage, disabled }),
    [controller, locale, languages, speechSpeed, changeLanguage, disabled],
  );
  useEffect(() => {
    const dispose = controller.observe();
    return () => dispose();
  }, [controller]);
  return { status, disable: controller.disable };
}
