import type { ConfigDraft, Configuration } from "./model";
import { castInstructionSchema, instructionText } from "./instruction-model";

/** 旧画面には文字列、構造対応を宣言した画面には保存文書を返す。 */
export function instructionResponse<
  T extends { configuration: Configuration; changes?: ConfigDraft["changes"] },
>(value: T, version?: string): T {
  if (version === "1") return value;
  const instructions = value.configuration.cast.instructions;
  return {
    ...value,
    configuration: {
      ...value.configuration,
      cast: {
        ...value.configuration.cast,
        instructions: {
          ja: instructionText(instructions.ja),
          en: instructionText(instructions.en),
        },
      },
    },
    ...(value.changes
      ? {
          changes: value.changes.map((change) => {
            if (!/^cast\.instructions\.(ja|en)$/.test(change.path)) return change;
            const before = castInstructionSchema.safeParse(change.before);
            const after = castInstructionSchema.safeParse(change.after);
            return {
              ...change,
              before: before.success ? instructionText(before.data) : change.before,
              after: after.success ? instructionText(after.data) : change.after,
            };
          }),
        }
      : {}),
  };
}
