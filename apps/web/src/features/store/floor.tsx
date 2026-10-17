import { tv } from "tailwind-variants";
import { useCallback } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useHydrated } from "@tanstack/react-router";
import { Tabs } from "@base-ui/react/tabs";
import { ErrorNotice } from "../../components/error-notice";
import { useI18n } from "../../i18n/locale";
import { floorOptions } from "./store-query";

import { useRealtime } from "../../lib/use-realtime";
import { TableMetrics } from "./table-metrics";
import { TableTimeline } from "./table-timeline";
import { useStore } from "./store-shell";
import { FloorTimeline } from "./floor-timeline";
import { storeDate, type FloorSearch } from "./floor-model";

const connectionDot = tv({
  base: "size-2 rounded-full",
  variants: { connected: { true: "bg-success", false: "bg-accent" } },
});

export function Floor({
  view = "list",
  date,
  initialNow,
  onNavigate,
}: FloorSearch & { initialNow?: number; onNavigate?: (search: FloorSearch) => void }) {
  const store = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const state = useSuspenseQuery(floorOptions(store.id));
  const hydrated = useHydrated();
  const referenceNow = initialNow ?? state.dataUpdatedAt;
  const selectedDate = date ?? storeDate(referenceNow);
  const connected = useRealtime({ storeId: store.id }, state.data.cursor, () => {
    void client.invalidateQueries({ queryKey: ["tablecast-admin", store.id] });
    void client.invalidateQueries({ queryKey: ["tablecast-floor-timeline", store.id] });
  });
  // 接続状態の更新で列のcell componentを作り直し、押下中のボタンを失わない。
  const selectVisit = useCallback(
    (sessionId: string) =>
      void navigate({
        to: "/admin/stores/$storeId/visits/$sessionId",
        params: { storeId: store.id, sessionId },
      }),
    [navigate, store.id],
  );
  const openTable = useCallback(
    (table: { id: string }) =>
      void navigate({
        to: "/admin/stores/$storeId/tables/$tableId/open",
        params: { storeId: store.id, tableId: table.id },
      }),
    [navigate, store.id],
  );
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

      <section aria-label={t("floor_current")}>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("floor_current")}</h2>
        <TableMetrics tables={state.data.tables} vacantCount={state.data.vacantTables.length} />
      </section>
      <Tabs.Root
        value={view}
        onValueChange={(next: unknown) => {
          if (next === "list" || next === "timeline")
            onNavigate?.({ view: next, date: selectedDate });
        }}
      >
        <Tabs.List className="mb-5 flex gap-1 border-b border-border [&_button]:min-h-12 [&_button]:border-b-2 [&_button]:border-transparent [&_button]:px-4 [&_button[data-active]]:border-primary [&_button[data-active]]:font-semibold">
          <Tabs.Tab value="list" disabled={!hydrated}>
            {t("floor_list")}
          </Tabs.Tab>
          <Tabs.Tab value="timeline" disabled={!hydrated}>
            {t("floor_timeline")}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="list">
          <TableTimeline
            initialNow={state.dataUpdatedAt}
            tables={state.data.tables}
            vacantTables={state.data.vacantTables}
            onSelect={selectVisit}
            onOpen={openTable}
          />
        </Tabs.Panel>
        <Tabs.Panel value="timeline">
          {view === "timeline" && (
            <FloorTimeline
              storeId={store.id}
              date={selectedDate}
              initialNow={referenceNow}
              tables={state.data.tables}
              vacantTables={state.data.vacantTables}
              onSelect={selectVisit}
              onOpen={openTable}
              onDateChange={(next) => onNavigate?.({ view: "timeline", date: next })}
            />
          )}
        </Tabs.Panel>
      </Tabs.Root>
    </>
  );
}

export function FloorPending() {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("admin_live")}</h1>
        <span role="status" className="text-sm text-muted-foreground">
          {t("common_loading")}
        </span>
      </div>
      <TableMetrics tables={[]} vacantCount={0} pending />
      <TableTimeline tables={[]} pending onSelect={() => undefined} />
    </>
  );
}
