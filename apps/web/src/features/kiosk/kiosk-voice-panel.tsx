import type { Locale } from "@tablecast/api/schema";
import { type ComponentProps, useEffect } from "react";
import type { VoiceConnection } from "./voice-connection";
import type { VoicePanel } from "./voice-panel";
import { useI18n } from "../../i18n/locale";
import { useLocalCamera } from "./local-camera";
import { useStandby } from "./use-standby";
import { VoicePanelContent } from "./voice-panel";
import { useVoiceView } from "./voice-subscription";

export function KioskVoicePanel({
  voice,
  onWakeLanguage,
  standbyBlocked = false,
  ...props
}: Omit<ComponentProps<typeof VoicePanel>, "view"> & {
  onWakeLanguage: (locale: Locale) => Promise<unknown>;
  standbyBlocked?: boolean;
  voice: VoiceConnection;
}) {
  const { locale } = useI18n();
  const view = useVoiceView(voice);
  const camera = useLocalCamera();
  const standby = useStandby({
    voice,
    locale,
    languages: props.catalog?.configuration.languages ?? [locale],
    speechSpeed: props.speechSpeed ?? 1,
    changeLanguage: onWakeLanguage,
    disabled: standbyBlocked,
  });
  const { capture, complete, getState } = camera;
  useEffect(
    () => voice.connectCamera({ capture, complete, getState }),
    [voice, capture, complete, getState],
  );
  return (
    <VoicePanelContent
      {...props}
      standby={{
        status: standby.status,
        onToggle: () => {
          camera.stop();
          standby.toggle();
        },
        disabled:
          standbyBlocked ||
          (!["off", "suspended", "error"].includes(standby.status)
            ? false
            : !["idle", "paused", "error"].includes(view.status)),
      }}
      onStart={() => {
        standby.disable();
        props.onStart();
      }}
      onMicrophoneChange={
        props.onMicrophoneChange
          ? (deviceId) => {
              standby.disable();
              props.onMicrophoneChange?.(deviceId);
            }
          : undefined
      }
      view={view}
      camera={{
        ...camera,
        start: async (...args) => {
          standby.disable();
          await camera.start(...args);
        },
        flip: async () => {
          standby.disable();
          await camera.flip();
        },
      }}
      onSuggestion={(text, source) => {
        void voice.sendSuggestion(text, source);
      }}
      controlDisabled={props.controlDisabled || view.status === "stopping"}
    />
  );
}
