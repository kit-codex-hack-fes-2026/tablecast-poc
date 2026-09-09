import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { sessionOptions } from "../../lib/session-query";

import { AdminShell } from "../admin/admin-shell";

export function SettingsShell({ children }: { children: ReactNode }) {
  const session = useQuery(sessionOptions);
  const path = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    if (!session.isPending && !session.error && !session.data)
      window.location.assign(
        `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
  }, [session.isPending, session.data, session.error]);
  return (
    <AdminShell
      tab={
        path === "/organisations" || path === "/stores/new"
          ? "organisations"
          : path === "/account/mcp-sessions" || path.startsWith("/account/integrations/")
            ? "mcp"
            : "account"
      }
    >
      {session.data ? (
        children
      ) : session.error ? (
        <ErrorNotice error={session.error} onRetry={() => void session.refetch()} />
      ) : (
        <LoadingState />
      )}
    </AdminShell>
  );
}
