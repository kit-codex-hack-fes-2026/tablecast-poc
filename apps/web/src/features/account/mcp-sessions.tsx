import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Clock, Eye, FilePenLine, Plug, ShieldOff } from "lucide-react";
import { useMemo } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { mcpSessionsOptions, type loadMcpSessions } from "./account-query";
import { IntegrationsShell } from "./integrations-shell";
type Session = Awaited<ReturnType<typeof loadMcpSessions>>["sessions"][number];
export function McpSessions() {
  const { t } = useI18n(),
    client = useQueryClient();
  const sessions = useQuery(mcpSessionsOptions);
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
      <ErrorNotice error={sessions.error || revoke.error} onRetry={() => void sessions.refetch()} />
      {sessions.isPending ? (
        <LoadingState />
      ) : !sessions.data ? null : (
        <DataTable
          data={sessions.data?.sessions ?? []}
          columns={columns}
          searchLabel={t("mcp_session_search")}
          empty={t("mcp_session_empty")}
          getRowId={(row) => row.id}
        />
      )}
    </IntegrationsShell>
  );
}
function sessionColumns(
  t: ReturnType<typeof useI18n>["t"],
  pending: boolean,
  revoke: (id: string) => void,
): ColumnDef<Session>[] {
  return [
    {
      id: "client",
      header: t("mcp_application"),
      cell: ({ row }) => (
        <div className="flex min-w-56 items-center gap-2">
          <Plug className="size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{row.original.clientName ?? row.original.clientId}</p>
            <p
              className="max-w-64 truncate text-sm text-muted-foreground"
              title={row.original.clientId}
            >
              {row.original.clientId}
            </p>
          </div>
        </div>
      ),
    },
    { accessorKey: "storeName", header: t("admin_store") },
    {
      accessorKey: "status",
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
      header: t("mcp_connected_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      accessorKey: "updatedAt",
      header: t("mcp_updated_at"),
      cell: ({ row }) => <DateTime value={row.original.updatedAt} />,
    },
    {
      accessorKey: "expiresAt",
      header: t("mcp_access_expires"),
      cell: ({ row }) => <DateTime value={row.original.expiresAt} />,
    },
    {
      accessorKey: "refreshExpiresAt",
      header: t("mcp_refresh_expires"),
      cell: ({ row }) => <DateTime value={row.original.refreshExpiresAt} />,
    },
    {
      id: "actions",
      header: t("common_actions"),
      cell: ({ row }) => (
        <ConfirmAction
          label={t("mcp_revoke")}
          subject={row.original.clientName ?? row.original.clientId}
          icon={<ShieldOff />}
          disabled={pending}
          onConfirm={() => revoke(row.original.id)}
        />
      ),
    },
  ];
}
