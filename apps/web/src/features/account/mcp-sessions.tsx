import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plug, ShieldOff } from "lucide-react";
import { useMemo } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { SettingsShell } from "./settings-shell";
const load = () => parseResponse(rpc.api.account["mcp-sessions"].$get());
type Session = Awaited<ReturnType<typeof load>>["sessions"][number];
export function McpSessions() {
  const { t } = useI18n(),
    client = useQueryClient();
  const sessions = useQuery({ queryKey: ["tablecast-mcp-sessions"], queryFn: load });
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
    <SettingsShell>
      <h1 className="text-2xl font-semibold">{t("mcp_sessions")}</h1>
      <ErrorNotice error={sessions.error || revoke.error} />
      {sessions.isPending ? (
        <p role="status">{t("common_loading")}</p>
      ) : (
        <DataTable
          data={sessions.data?.sessions ?? []}
          columns={columns}
          getRowId={(row) => row.id}
        />
      )}
    </SettingsShell>
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
        <div className="flex items-center gap-2">
          <Plug className="size-5" />
          {row.original.clientName ?? row.original.clientId}
        </div>
      ),
    },
    { accessorKey: "storeName", header: t("admin_store") },
    {
      id: "scopes",
      header: t("mcp_scopes"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.scopes.map((scope) => (
            <Badge key={scope} variant="outline">
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
      header: t("invite_expires_at"),
      cell: ({ row }) => <DateTime value={row.original.expiresAt} />,
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
