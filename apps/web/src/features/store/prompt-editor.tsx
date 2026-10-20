import type { CastInstruction, Locale } from "@tablecast/api/schema";
import PromptEditorInput from "./prompt-editor-input";

export type PromptEditorProps = {
  id: string;
  labelledBy: string;
  language: Locale;
  value: CastInstruction;
  onChange: (value: CastInstruction) => void;
  disabled: boolean;
  focusRequested?: boolean;
};

export function PromptEditor(props: PromptEditorProps) {
  return <PromptEditorInput {...props} />;
}
