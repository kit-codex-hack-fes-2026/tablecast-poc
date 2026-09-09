import { useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useI18n } from "../../i18n/locale";
import { authClient } from "../../lib/auth-client";
import { AdminShell } from "../admin/admin-shell";

export function SettingsShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const session = authClient.useSession();
  const path = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    if (!session.isPending && !session.data)
      window.location.assign(
        `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
  }, [session.isPending, session.data]);
  return (
    <AdminShell tab={path === "/organisations" ? "organisations" : "account"}>
      {session.data ? (
        children
      ) : (
        <div className="min-h-96" aria-busy="true">
          {t("account_loading")}
        </div>
      )}
    </AdminShell>
  );
}
