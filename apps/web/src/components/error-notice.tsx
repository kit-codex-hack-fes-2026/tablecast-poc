import { AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { useI18n } from "../i18n/locale";
import { apiError } from "../lib/api-error";
import { validationIssuesSchema } from "@tablecast/api/schema";

export function ErrorNotice({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t, locale } = useI18n();
  if (!error) return null;
  let message = t("common_error");
  if (error instanceof TypeError) message = t("common_connection_error");
  const failure = apiError(error);
  const validation =
    failure?.code === "INVALID_INPUT"
      ? validationIssuesSchema.safeParse(failure.details)
      : undefined;
  if (failure) {
    if (failure.status === 401) message = t("common_session_error");
    else if (failure.status === 403) message = t("common_forbidden");
    else if (failure.status === 404) message = t("common_not_found");
    else if (failure.status === 409 || failure.status === 410) message = t("common_conflict");
    else if (failure.status === 400 || failure.status === 422) message = t("common_invalid_input");
    else if (failure.status === 413) message = t("common_too_large");
    else if (failure.status === 429) message = t("common_rate_limited");
    else if (failure.status && failure.status >= 500) message = t("common_unavailable");
  }
  return (
    <div
      className="flex items-start gap-2.5 py-3 px-3.5 rounded-md text-sm leading-relaxed [&_svg]:shrink-0 [&_svg]:mt-0.5 [&_[data-slot=button][data-size=text]]:min-h-6 [&_[data-slot=button][data-size=text]]:ml-auto [&_[data-slot=button][data-size=text]]:shrink-0 text-destructive bg-destructive/10"
      role="alert"
    >
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <span>{message}</span>
        {validation?.success && validation.data.length > 0 && (
          <ul className="mt-2 list-disc pl-5">
            {validation.data.map((issue) => (
              <li key={`${issue.path.join(".")}:${issue.code}:${issue.messages[locale]}`}>
                {issue.path.length > 0 && `${issue.path.join(" · ")}: `}
                {issue.messages[locale]}
              </li>
            ))}
          </ul>
        )}
      </div>
      {onRetry && (
        <Button
          size="text"
          variant="link"
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
        >
          {t("common_retry")}
        </Button>
      )}
    </div>
  );
}
