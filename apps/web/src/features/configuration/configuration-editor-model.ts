import { type Configuration } from "@tablecast/api/schema";

export const selectClass = "h-12 rounded-lg border border-input px-3 text-base";

export type EditorProps = {
  disabled: boolean;
  onChange: React.Dispatch<React.SetStateAction<Configuration>>;
  selectedId: string;
  value: Configuration;
};
