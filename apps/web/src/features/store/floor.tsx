import { tv } from "tailwind-variants";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { useI18n } from "../../i18n/locale";
import { floorOptions } from "./store-query";

import { useRealtime } from "../../lib/use-realtime";
import { TableMetrics } from "../admin/table-metrics";
import { TableTimeline } from "../admin/table-timeline";
import { useStore } from "./store-shell";

const connectionDot = tv({
  base: "size-2 rounded-full",
  variants: { connected: { true: "bg-success", false: "bg-accent" } },
});

export function Floor() {
  const store = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const state = useQuery(floorOptions(store.id));
  const connected = useRealtime({ storeId: store.id }, state.data?.cursor ?? 0, () => {
    void client.invalidateQueries({ queryKey: ["tablecast-admin", store.id] });
  });
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("admin_live")}</h1>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={connectionDot({ connected })} />
          {t(connected ? "admin_live_connected" : "admin_live_reconnecting")}
        </span>
      </div>
      <ErrorNotice error={state.error} onRetry={() => void state.refetch()} />
      {state.data ? (
        <>
          <TableMetrics tables={state.data.tables} vacantCount={state.data.vacantTables.length} />
          <TableTimeline
            initialNow={state.dataUpdatedAt}
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
      ) : state.isPending ? (
        <LoadingState cards />
      ) : null}
    </>
  );
}
