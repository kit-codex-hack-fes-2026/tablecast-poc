import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { sessionOptions } from "../../lib/session-query";
import { StoreAdminShell } from "../store/admin-shell";

export function SettingsShell({
  children,
  publicContent = false,
}: {
  children: ReactNode;
  publicContent?: boolean;
}) {
  const session = useQuery(sessionOptions);
  const path = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    if (!session.isPending && !session.error && !session.data)
      window.location.assign(
        `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
  }, [session.isPending, session.data, session.error]);
  return (
    <StoreAdminShell
      tab={
        path === "/organisations" || path === "/stores/new"
          ? "organisations"
          : path === "/account/mcp-sessions" || path.startsWith("/account/integrations/")
            ? "mcp"
            : "account"
      }
    >
      {session.data || (publicContent && session.isPending) ? (
        children
      ) : session.error ? (
        <ErrorNotice query={session} />
      ) : (
        <LoadingState />
      )}
    </StoreAdminShell>
  );
}
