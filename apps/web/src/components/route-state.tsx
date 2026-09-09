import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useI18n } from "../i18n/locale";
import { ErrorNotice } from "./error-notice";
import { LoadingState } from "./loading-state";

export function RoutePending() {
  return (
    <div className="min-h-80 w-full">
      <LoadingState />
    </div>
  );
}
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const client = useQueryClient();
  const { t } = useI18n();
  return (
    <section
      aria-label={t("common_error")}
      className="mx-auto flex min-h-80 w-full max-w-3xl flex-col justify-center gap-6 p-6"
    >
      <h1 className="text-xl font-semibold">{t("common_error")}</h1>
      <ErrorNotice
        error={error}
        onRetry={() => {
          void client
            .resetQueries()
            .then(() => router.invalidate())
            .then(reset);
        }}
      />
      <Link to="/" className="underline underline-offset-4">
        TableCast
      </Link>
    </section>
  );
}
