import type { Locale } from "@tablecast/api/schema";
import { validationIssuesSchema } from "@tablecast/api/schema";
import { apiError } from "./api-error";

export function serverFieldErrors(
  error: unknown,
  locale: Locale,
  fieldNames: Record<string, string>,
) {
  const failure = apiError(error);
  const parsed =
    failure?.code === "INVALID_INPUT"
      ? validationIssuesSchema.safeParse(failure.details)
      : undefined;
  const issues = parsed?.success ? parsed.data : [];
  const result: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.join(".");
    const key = fieldNames[path] ?? path;
    (result[key] ??= []).push(issue.messages[locale]);
  }
  return result;
}

export function activeServerFieldErrors(
  fields: Record<string, string[]>,
  metadata: Record<string, undefined | { errorMap: { onServer?: unknown } }>,
  sameError: boolean,
) {
  // 言語切替では、入力の修正によって消えたサーバーエラーを復活させない。
  return sameError
    ? Object.fromEntries(
        Object.entries(fields).filter(([path]) => metadata[path]?.errorMap.onServer),
      )
    : fields;
}
