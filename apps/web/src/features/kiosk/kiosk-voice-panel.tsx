import type { ComponentProps } from "react";
import type { VoiceConnection } from "./voice-connection";
import { VoicePanel } from "./voice-panel";
import { useVoiceView } from "./voice-subscription";

export function KioskVoicePanel({
  voice,
  ...props
}: Omit<ComponentProps<typeof VoicePanel>, "view"> & { voice: VoiceConnection }) {
  const view = useVoiceView(voice);
  return (
    <VoicePanel
      {...props}
      view={view}
      onSuggestion={(text, source) => {
        void voice.sendSuggestion(text, source);
      }}
      controlDisabled={props.controlDisabled || view.status === "stopping"}
    />
  );
}
