import { tv } from "tailwind-variants";
import { useCallback } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useHydrated } from "@tanstack/react-router";
import { Tabs } from "@base-ui/react/tabs";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
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
  filter = "all",
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
        search: { floorView: view, floorDate: selectedDate, floorFilter: filter },
      }),
    [navigate, store.id, view, selectedDate, filter],
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
      <PageHeader
        title={t("admin_live")}
        status={
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={connectionDot({ connected })} />
            {t(connected ? "admin_live_connected" : "admin_live_reconnecting")}
          </span>
        }
      />
      <ErrorNotice error={state.error} onRetry={() => void state.refetch()} />

      <section aria-label={t("floor_current")}>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("floor_current")}</h2>
        <TableMetrics
          tables={state.data.tables}
          vacantCount={state.data.vacantTables.length}
          filter={filter}
          onFilterChange={(next) =>
            onNavigate?.({ view: "list", date: selectedDate, filter: next })
          }
        />
      </section>
      <Tabs.Root
        value={view}
        onValueChange={(next: unknown) => {
          if (next === "list" || next === "timeline")
            onNavigate?.({ view: next, date: selectedDate, filter });
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
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t(`floor_filter_${filter}`)}</h2>
            <div className="flex flex-wrap gap-2" aria-label={t("floor_filters")} role="group">
              {(["all", "attention", "vacant"] as const).map((next) => (
                <Button
                  key={next}
                  variant={filter === next ? "secondary" : "ghost"}
                  aria-pressed={filter === next}
                  onClick={() => onNavigate?.({ view: "list", date: selectedDate, filter: next })}
                >
                  {t(`floor_filter_${next}`)}
                </Button>
              ))}
            </div>
          </div>
          <TableTimeline
            filter={filter}
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
              onDateChange={(next) => onNavigate?.({ view: "timeline", date: next, filter })}
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
      <PageHeader
        title={t("admin_live")}
        status={
          <span role="status" className="text-sm text-muted-foreground">
            {t("common_loading")}
          </span>
        }
      />
      <TableMetrics tables={[]} vacantCount={0} pending />
      <TableTimeline tables={[]} pending onSelect={() => undefined} />
    </>
  );
}
