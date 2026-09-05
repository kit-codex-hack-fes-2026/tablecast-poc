import { Button } from "../components/ui/button";
import { AlertCircle } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { ApiFailure } from "../lib/api";

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  if (!error) return null;
  let message = t("common_error");
  if (error instanceof TypeError) message = t("common_connection_error");
  if (error instanceof ApiFailure) {
    if (error.status === 401) message = t("common_session_error");
    else if (error.status === 403) message = t("common_forbidden");
    else if (error.status === 409 || error.status === 410) message = t("common_conflict");
    else if (error.status === 503) message = t("common_unavailable");
  }
  return (
    <div className="notice error-notice" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <Button variant="ghost" className="text-button" type="button" onClick={onRetry}>
          {t("common_retry")}
        </Button>
      )}
    </div>
  );
}
