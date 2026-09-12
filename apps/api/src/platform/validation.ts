import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";
import { en, ja } from "zod/locales";
import { DomainError } from "./errors";

const locales = { ja: ja().localeError, en: en().localeError };
function message(issue: z.core.$ZodIssue, locale: keyof typeof locales) {
  // 正規表現や未知のキーを利用者向けメッセージへ埋め込まない。
  if (
    (issue.code === "invalid_format" && issue.format === "regex") ||
    issue.code === "unrecognized_keys"
  ) {
    const result = locales[locale]({ code: "custom", input: undefined });
    return typeof result === "string" ? result : (result?.message ?? "Invalid input");
  }
  const result = locales[locale](
    issue.code === "invalid_type"
      ? { ...issue, input: issue.input }
      : { ...issue, input: undefined },
  );
  return typeof result === "string" ? result : (result?.message ?? "Invalid input");
}

const validator = <Target extends "json" | "query" | "form", Output, Input>(
  target: Target,
  schema: z.ZodType<Output, Input>,
) =>
  zValidator(
    target,
    schema,
    (result) => {
      if (!result.success)
        throw new DomainError(
          "INVALID_INPUT",
          target === "query" ? 400 : 422,
          "INVALID_INPUT",
          result.error.issues.map((issue) => ({
            path: issue.path,
            code: issue.code,
            messages: { ja: message(issue, "ja"), en: message(issue, "en") },
          })),
        );
    },
    {
      // 入力は翻訳で型を判別する間だけ使い、公開details・例外causeへ含めない。
      validationFunction: (inputSchema, value) =>
        inputSchema.safeParseAsync(value, { reportInput: true }),
    },
  );

export const validate = <Output, Input>(schema: z.ZodType<Output, Input>) =>
  validator("json", schema);
export const validateQuery = <Output, Input>(schema: z.ZodType<Output, Input>) =>
  validator("query", schema);
export const validateForm = <Output, Input>(schema: z.ZodType<Output, Input>) =>
  validator("form", schema);
