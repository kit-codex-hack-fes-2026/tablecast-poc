import type { AnyFieldLikeMeta } from "@tanstack/react-form";
import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "../../i18n/locale";
import { useFormContext } from "../../lib/form-context";
import { activeServerFieldErrors, serverFieldErrors } from "../../lib/server-field-errors";
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
  const fields = useMemo(
    () => serverFieldErrors(error, locale, fieldNames),
    [error, locale, fieldNames],
  );
  const previousError = useRef<unknown>(undefined);
  useEffect(() => {
    const metadata: Record<string, AnyFieldLikeMeta | undefined> = form.state.fieldMeta;
    const activeFields = activeServerFieldErrors(fields, metadata, previousError.current === error);
    previousError.current = error;
    form.setErrorMap({ onServer: { fields: activeFields } });
  }, [form, fields, error]);
  const attached =
    Object.keys(fields).length > 0 &&
    Object.keys(fields).every((path) => Object.hasOwn(form.state.fieldMeta, path));
  return attached ? null : <ErrorNotice error={error} />;
}
