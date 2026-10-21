import type { CastInstruction, Locale } from "@tablecast/api/schema";
import PromptEditorInput from "./prompt-editor-input";

export type PromptEditorProps = {
  disabled: boolean;
  focusRequested?: boolean;
  id: string;
  labelledBy: string;
  language: Locale;
  onChange: (value: CastInstruction) => void;
  value: CastInstruction;
};

export function PromptEditor(props: PromptEditorProps) {
  return <PromptEditorInput {...props} />;
}
