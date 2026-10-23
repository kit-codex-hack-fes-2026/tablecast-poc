import { useSyncExternalStore } from "react";
import type { VoiceConnection } from "./voice-connection";

export function useVoiceView(voice: VoiceConnection) {
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getSnapshot);
}
export function useVoiceControls(voice: VoiceConnection) {
  useSyncExternalStore(
    voice.subscribe,
    () => {
      const view = voice.getSnapshot();
      return `${view.status}:${view.error ?? ""}`;
    },
    () => "idle:",
  );
  const { status, error } = voice.getSnapshot();
  return { status, error };
}
