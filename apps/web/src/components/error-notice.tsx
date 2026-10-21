import { validationIssuesSchema } from "@tablecast/api/schema";
import { AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { useI18n } from "../i18n/locale";
import { apiError } from "../lib/api-error";

function errorMessageKey(error: unknown): Parameters<ReturnType<typeof useI18n>["t"]>[0] {
  const failure = apiError(error);
  if (!failure) return error instanceof TypeError ? "common_connection_error" : "common_error";
  if (failure.code === "CONFIGURATION_FORMAT_UNSUPPORTED") return "condition_upgrade_error";
  switch (failure.status) {
    case undefined:
      return "common_error";
    case 401:
      return "common_session_error";
    case 403:
      return "common_forbidden";
    case 404:
      return "common_not_found";
    case 409:
    case 410:
      return "common_conflict";
    case 400:
    case 422:
      return "common_invalid_input";
    case 413:
      return "common_too_large";
    case 429:
      return "common_rate_limited";
    default:
      return failure.status && failure.status >= 500 ? "common_unavailable" : "common_error";
  }
}

/**
 * 通信・認可・競合など画面全体の失敗を表示する。
 * errorはunknownで受けAPIエラーを翻訳し、生の内部エラーを表示しない。
 * onRetryを渡す場合は呼出し元が再取得し、retryingで二重操作を防ぐ。
 * 入力エラーにはFieldErrorsを使う。
 * 取得済み情報を消さず隣接して配置する。
 */
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
  const message = t(errorMessageKey(error));
  const failure = apiError(error);
  const validation =
    failure?.code === "INVALID_INPUT"
      ? validationIssuesSchema.safeParse(failure.details)
      : undefined;
  return (
    <div
      className="motion-safe:animate-tablecast-state flex items-start gap-2.5 rounded-md bg-destructive/10 px-3.5 py-3 text-sm leading-relaxed text-destructive"
      role="alert"
    >
      <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1 wrap-anywhere">
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
          className="ml-auto"
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
