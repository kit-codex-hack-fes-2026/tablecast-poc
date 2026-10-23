import { CalendarClock, CalendarDays, Link2, ShieldCheck, Unlink } from "lucide-react";
import { useMemo } from "react";
import type { AccountController, Connection } from "./account-state";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { GoogleIcon } from "../../components/google-icon";
import { Button } from "../../components/ui/button";
import { authClient, authResult } from "../../lib/auth-client";
import { useCollectionSearch } from "../shell/collection-search";

export function AccountConnections({ controller }: { controller: AccountController }) {
  const { t, accounts, change, session, section } = controller;
  const collection = useCollectionSearch({
    prefix: "connections",
    sortIds: ["providerId", "createdAt", "updatedAt"],
  });
  const columns = useMemo(
    () =>
      connectionColumns(
        t,
        session.data?.user.email,
        change.isPending || controller.loading,
        change.mutate,
      ),
    [t, session.data?.user.email, change.isPending, controller.loading, change.mutate],
  );
  return (
    <section
      id="account-connections"
      aria-labelledby="account-connections-title"
      className={section}
    >
      <h2 id="account-connections-title" className="flex items-center gap-2 text-lg font-semibold">
        <Link2 />
        {t("account_connections")}
      </h2>
      <DataTable
        {...collection}
        searchLabel={t("account_connections_search")}
        searchPlaceholder={t("account_connections_search")}
        data={accounts.data?.filter((item) => item.providerId === "google") ?? []}
        pending={accounts.isPending}
        error={accounts.error}
        onRetry={() => void accounts.refetch()}
        columns={columns}
        getRowId={(row) => row.id}
      />
      <div className="min-h-11">
        {(!accounts.data || !accounts.data.some((item) => item.providerId === "google")) && (
          <Button
            variant="outline"
            disabled={change.isPending || controller.loading}
            onClick={() =>
              change.mutate(async () => {
                authResult(
                  await authClient.linkSocial({ provider: "google", callbackURL: "/account" }),
                );
              })
            }
          >
            <GoogleIcon />
            {t("account_link_google")}
          </Button>
        )}
      </div>
    </section>
  );
}

function connectionColumns(
  t: AccountController["t"],
  email: string | undefined,
  pending: boolean,
  change: (action: () => Promise<void>) => void,
): DataTableColumn<Connection>[] {
  return [
    {
      id: "providerId",
      accessorFn: (row) => (row.providerId === "google" ? "Google" : t("auth_password")),
      meta: { icon: Link2 },
      header: t("account_connections"),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.providerId === "google" ? <GoogleIcon /> : <ShieldCheck />}
          <div>
            <p>{row.original.providerId === "google" ? "Google" : t("auth_password")}</p>
            <p className="text-sm text-muted-foreground">{email}</p>
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
      id: "actions",
      header: t("account_unlink"),
      cell: ({ row }) =>
        row.original.providerId !== "credential" && (
          <ConfirmAction
            label={t("account_unlink")}
            subject={`Google · ${email}`}
            disabled={pending}
            icon={<Unlink />}
            onConfirm={() =>
              change(async () => {
                authResult(await authClient.unlinkAccount({ accountId: row.original.id }));
              })
            }
          />
        ),
    },
  ];
}
