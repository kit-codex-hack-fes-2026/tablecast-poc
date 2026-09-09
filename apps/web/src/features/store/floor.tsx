import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ErrorNotice } from "../../components/error-notice";
import { useI18n } from "../../i18n/locale";

import { parseResponse, rpc } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { TableMetrics } from "../admin/table-metrics";
import { TableTimeline } from "../admin/table-timeline";
import { useStore } from "./store-shell";
export function Floor() {
  const store = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ["tablecast-admin", store.id],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].$get(
          { param: { storeId: store.id } },
          { init: { signal } },
        ),
      ),
    refetchInterval: 30_000,
  });
  const connected = useRealtime({ storeId: store.id }, state.data?.cursor ?? 0, () => {
    void client.invalidateQueries({ queryKey: ["tablecast-admin", store.id] });
  });
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("admin_live")}</h1>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`size-2 rounded-full ${connected ? "bg-success" : "bg-accent"}`} />
          {t(connected ? "admin_live_connected" : "admin_live_reconnecting")}
        </span>
      </div>
      <ErrorNotice error={state.error} />
      {state.data ? (
        <>
          <TableMetrics tables={state.data.tables} vacantCount={state.data.vacantTables.length} />
          <TableTimeline
            tables={state.data.tables}
            vacantTables={state.data.vacantTables}
            onSelect={(sessionId) =>
              void navigate({
                to: "/admin/stores/$storeId/visits/$sessionId",
                params: { storeId: store.id, sessionId },
              })
            }
            onOpen={(table) =>
              void navigate({
                to: "/admin/stores/$storeId/tables/$tableId/open",
                params: { storeId: store.id, tableId: table.id },
              })
            }
          />
        </>
      ) : (
        <p role="status">{t("common_loading")}</p>
      )}
    </>
  );
}
