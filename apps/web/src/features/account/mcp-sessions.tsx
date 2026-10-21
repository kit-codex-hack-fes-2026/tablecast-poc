import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  FilePenLine,
  Plug,
  ShieldCheck,
  ShieldOff,
  Store,
} from "lucide-react";
import { useMemo } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
import { useCollectionSearch } from "../shell/collection-search";
import { parseResponse, rpc } from "../../lib/api";
import { mcpSessionsOptions, type loadMcpSessions } from "./account-query";
import { IntegrationsShell } from "./integrations-shell";
type Session = Awaited<ReturnType<typeof loadMcpSessions>>["sessions"][number];
export function McpSessions() {
  const { t } = useI18n(),
    client = useQueryClient();
  const sessions = useQuery(mcpSessionsOptions);
  const collection = useCollectionSearch({
    sortIds: [
      "client",
      "storeName",
      "status",
      "scopes",
      "createdAt",
      "updatedAt",
      "expiresAt",
      "refreshExpiresAt",
    ],
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      parseResponse(rpc.api.account["mcp-sessions"][":id"].revoke.$post({ param: { id } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-mcp-sessions"] }),
  });
  const columns = useMemo(
    () => sessionColumns(t, revoke.isPending, revoke.mutate),
    [t, revoke.isPending, revoke.mutate],
  );
  return (
    <IntegrationsShell>
      <h2 className="text-xl font-semibold">{t("mcp_oauth_sessions")}</h2>
      <ErrorNotice error={revoke.error} />

      <DataTable
        {...collection}
        data={sessions.data?.sessions ?? []}
        pending={sessions.isPending}
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
        columns={columns}
        searchLabel={t("mcp_session_search")}
        searchPlaceholder={t("mcp_session_search")}
        empty={t("mcp_session_empty")}
        getRowId={(row) => row.id}
      />
    </IntegrationsShell>
  );
}
function sessionColumns(
  t: ReturnType<typeof useI18n>["t"],
  pending: boolean,
  revoke: (id: string) => void,
): DataTableColumn<Session>[] {
  return [
    {
      id: "client",
      accessorFn: (row) => row.clientName ?? t("object_external_app"),
      meta: { icon: Plug },
      header: t("mcp_application"),
      cell: ({ row }) => (
        <div className="flex min-w-56 items-center gap-2">
          <Plug className="size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{row.original.clientName ?? t("object_external_app")}</p>
          </div>
        </div>
      ),
    },
    { accessorKey: "storeName", header: t("admin_store"), meta: { icon: Store } },
    {
      accessorKey: "status",
      meta: { icon: CheckCircle2 },
      header: t("mcp_status"),
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "active" : "inactive"}>
          {row.original.status === "active" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Clock className="size-4" />
          )}
          {t(row.original.status === "active" ? "mcp_active" : "mcp_expired")}
        </Badge>
      ),
    },
    {
      id: "scopes",
      accessorFn: (row) => row.scopes.join(" "),
      meta: { icon: ShieldCheck },
      header: t("mcp_scopes"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.scopes.map((scope) => (
            <Badge key={scope} variant="outline">
              {scope === "tablecast:read" ? (
                <Eye className="size-4" />
              ) : scope === "tablecast:write" ? (
                <FilePenLine className="size-4" />
              ) : null}
              {scope}
            </Badge>
          ))}
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
      header: t("mcp_access_expires"),
      cell: ({ row }) => <DateTime value={row.original.expiresAt} />,
    },
    {
      accessorKey: "refreshExpiresAt",
      meta: { icon: Clock },
      header: t("mcp_refresh_expires"),
      cell: ({ row }) => <DateTime value={row.original.refreshExpiresAt} />,
    },
    {
      id: "actions",
      header: t("common_actions"),
      cell: ({ row }) => (
        <ConfirmAction
          label={t("mcp_revoke")}
          subject={row.original.clientName ?? t("object_external_app")}
          icon={<ShieldOff />}
          disabled={pending}
          onConfirm={() => revoke(row.original.id)}
        />
      ),
    },
  ];
}
