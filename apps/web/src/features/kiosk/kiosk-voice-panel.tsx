import { type ComponentProps, useEffect } from "react";
import type { VoiceConnection } from "./voice-connection";
import type { VoicePanel } from "./voice-panel";
import { useLocalCamera } from "./local-camera";
import { VoicePanelContent } from "./voice-panel";
import { useVoiceView } from "./voice-subscription";

export function KioskVoicePanel({
  voice,
  ...props
}: Omit<ComponentProps<typeof VoicePanel>, "view"> & { voice: VoiceConnection }) {
  const view = useVoiceView(voice);
  const camera = useLocalCamera();
  const { capture, complete, getState } = camera;
  useEffect(
    () => voice.connectCamera({ capture, complete, getState }),
    [voice, capture, complete, getState],
  );
  return (
    <VoicePanelContent
      {...props}
      view={view}
      camera={camera}
      onSuggestion={(text, source) => {
        void voice.sendSuggestion(text, source);
      }}
      controlDisabled={props.controlDisabled || view.status === "stopping"}
    />
  );
}
