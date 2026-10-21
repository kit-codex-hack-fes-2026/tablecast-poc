import { CalendarClock, CalendarDays, Check, Clock, LogOut, Monitor } from "lucide-react";
import { useMemo } from "react";
import type { AccountController, Session } from "./account-state";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { Badge } from "../../components/ui/badge";
import { authClient, authResult } from "../../lib/auth-client";
import { useCollectionSearch } from "../shell/collection-search";
import { sessionDeviceName } from "./session-device-model";

export function AccountSessions({ controller }: { controller: AccountController }) {
  const { t, sessions, session, change, section } = controller;
  const collection = useCollectionSearch({
    prefix: "sessions",
    sortIds: ["userAgent", "createdAt", "updatedAt", "expiresAt"],
  });
  const columns = useMemo(
    () =>
      loginSessionColumns(
        t,
        session.data?.session.id,
        change.isPending || controller.loading,
        change.mutate,
      ),
    [t, session.data?.session.id, change.isPending, controller.loading, change.mutate],
  );
  return (
    <section id="account-sessions" aria-labelledby="account-sessions-title" className={section}>
      <h2 id="account-sessions-title" className="flex items-center gap-2 text-lg font-semibold">
        <Monitor />
        {t("account_sessions")}
      </h2>
      <DataTable
        {...collection}
        searchLabel={t("account_sessions_search")}
        searchPlaceholder={t("account_sessions_search")}
        data={sessions.data ?? []}
        pending={sessions.isPending}
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
        columns={columns}
        getRowId={(row) => row.id}
      />
      <ConfirmAction
        label={t("account_revoke_others")}
        subject={t("account_keep_current")}
        disabled={change.isPending || controller.loading}
        icon={<LogOut />}
        onConfirm={() =>
          change.mutate(async () => {
            authResult(await authClient.revokeOtherSessions());
          })
        }
      />
    </section>
  );
}

function loginSessionColumns(
  t: AccountController["t"],
  currentId: string | undefined,
  pending: boolean,
  change: (action: () => Promise<void>) => void,
): DataTableColumn<Session>[] {
  return [
    {
      id: "userAgent",
      accessorFn: (row) => sessionDeviceName(row.userAgent, t("account_device")),
      meta: { icon: Monitor },
      header: t("account_device"),
      cell: ({ row }) => (
        <div className="flex max-w-sm items-center gap-3">
          <Monitor className="shrink-0" />
          <div>
            <p className="wrap-break-word text-sm">
              {sessionDeviceName(row.original.userAgent, t("account_device"))}
            </p>
            {row.original.id === currentId && (
              <Badge variant="secondary">
                <Check />
                {t("account_current")}
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      meta: { icon: CalendarDays },
      header: t("mcp_connected_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      accessorKey: "updatedAt",
      meta: { icon: CalendarClock },
      header: t("mcp_updated_at"),
      cell: ({ row }) => <DateTime value={row.original.updatedAt} />,
    },
    {
      accessorKey: "expiresAt",
      meta: { icon: Clock },
      header: t("invite_expires_at"),
      cell: ({ row }) => <DateTime value={row.original.expiresAt} />,
    },
    {
      id: "actions",
      header: t("account_revoke"),
      cell: ({ row }) => (
        <ConfirmAction
          label={t("account_revoke")}
          subject={sessionDeviceName(row.original.userAgent, t("account_device"))}
          disabled={pending}
          icon={<LogOut />}
          onConfirm={() =>
            change(async () => {
              authResult(await authClient.revokeSession({ token: row.original.token }));
              if (row.original.id === currentId) window.location.assign("/login");
            })
          }
        />
      ),
    },
  ];
}
