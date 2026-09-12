import type { AnyFieldLikeMeta } from "@tanstack/react-form";
import { useEffect, useMemo, useRef } from "react";
import { validationIssuesSchema } from "@tablecast/api/schema";
import { useI18n } from "../../i18n/locale";
import { apiError } from "../../lib/api-error";
import { useFormContext } from "../../lib/form-context";
import { ErrorNotice } from "../error-notice";
const unchangedNames: Record<string, string> = {};

export function FormErrors({
  error,
  fieldNames = unchangedNames,
}: {
  error: unknown;
  fieldNames?: Record<string, string>;
}) {
  const form = useFormContext();
  const { locale } = useI18n();
  const fields = useMemo(() => {
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
  }, [error, locale, fieldNames]);
  const previousError = useRef<unknown>(undefined);
  useEffect(() => {
    // 言語切替では、入力の修正によって消えたサーバーエラーを復活させない。
    const metadata: Record<string, AnyFieldLikeMeta | undefined> = form.state.fieldMeta;
    const activeFields =
      previousError.current === error
        ? Object.fromEntries(
            Object.entries(fields).filter(([path]) => metadata[path]?.errorMap.onServer),
          )
        : fields;
    previousError.current = error;
    form.setErrorMap({ onServer: { fields: activeFields } });
  }, [form, fields, error]);
  const attached =
    Object.keys(fields).length > 0 &&
    Object.keys(fields).every((path) => Object.hasOwn(form.state.fieldMeta, path));
  return attached ? null : <ErrorNotice error={error} />;
}
