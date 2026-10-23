import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useHydrated, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { useCallback } from "react";
import { tv } from "tailwind-variants";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { useRealtime } from "../../lib/use-realtime";
import { useStore } from "../store/store-context";
import { FloorControls } from "./floor-controls";
import { type FloorSearch, storeDate } from "./floor-model";
import { floorOptions } from "./floor-query";
import { FloorTimeline } from "./floor-timeline";
import { TableMetrics } from "./table-metrics";
import { TableTimeline } from "./table-timeline";

const connectionDot = tv({
  base: "size-2 rounded-full",
  variants: { connected: { true: "bg-success", false: "bg-accent" } },
});

export function Floor({
  view = "list",
  filter = "all",
  date,
  q = "",
  sort,
  zoom,
  initialNow,
  onNavigate,
}: FloorSearch & {
  initialNow?: number;
  onNavigate?: (search: FloorSearch, options?: { replace?: boolean }) => void;
}) {
  const store = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const state = useSuspenseQuery(floorOptions(store.id));
  const hydrated = useHydrated();
  const search = q;
  const referenceNow = initialNow ?? state.dataUpdatedAt;
  const selectedDate = date ?? storeDate(referenceNow);
  const criteria = { view, date: selectedDate, filter, q: search || undefined, sort, zoom };
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
        search: {
          floorView: view,
          floorDate: selectedDate,
          floorFilter: filter,
          floorQ: search || undefined,
          floorSort: sort,
          floorZoom: zoom,
        },
      }),
    [navigate, store.id, view, selectedDate, filter, search, sort, zoom],
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
        icon={<LayoutDashboard />}
        status={
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={connectionDot({ connected })} />
            {t(connected ? "admin_live_connected" : "admin_live_reconnecting")}
          </span>
        }
      />
      <ErrorNotice query={state} />

      <section aria-label={t("floor_current")}>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("floor_current")}</h2>
        <TableMetrics
          tables={state.data.tables}
          vacantCount={state.data.vacantTables.length}
          filter={filter}
          onFilterChange={(next) => onNavigate?.({ ...criteria, view: "list", filter: next })}
        />
      </section>
      <Tabs.Root
        value={view}
        onValueChange={(next: unknown) => {
          if (next === "list" || next === "timeline") onNavigate?.({ ...criteria, view: next });
        }}
      >
        <FloorControls
          view={view}
          filter={filter}
          search={search}
          sort={sort}
          onSearchChange={(next) =>
            onNavigate?.({ ...criteria, q: next || undefined }, { replace: true })
          }
          onSortChange={(next) => onNavigate?.({ ...criteria, sort: next })}
          onReset={() =>
            onNavigate?.({ ...criteria, q: undefined, sort: undefined, filter: "all" })
          }
          disabled={!hydrated}
          onFilterChange={(next) => onNavigate?.({ ...criteria, filter: next })}
        />
        <Tabs.Panel value="list">
          <h2 className="mb-4 text-lg font-semibold">{t(`floor_filter_${filter}`)}</h2>
          <TableTimeline
            search={search}
            filter={filter}
            sort={sort}
            initialNow={referenceNow}
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
              search={search}
              sort={sort}
              zoom={zoom}
              onZoomChange={(next, options) => onNavigate?.({ ...criteria, zoom: next }, options)}
              tables={state.data.tables}
              vacantTables={state.data.vacantTables}
              onSelect={selectVisit}
              onOpen={openTable}
              onDateChange={(next) => onNavigate?.({ ...criteria, view: "timeline", date: next })}
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
        icon={<LayoutDashboard />}
        status={
          <span role="status" className="text-sm text-muted-foreground">
            {t("common_loading")}
          </span>
        }
      />
      <section aria-label={t("floor_current")}>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("floor_current")}</h2>
        <TableMetrics tables={[]} vacantCount={0} pending />
      </section>
      <Tabs.Root value="list">
        <FloorControls
          view="list"
          filter="all"
          search=""
          onSearchChange={() => undefined}
          onSortChange={() => undefined}
          onReset={() => undefined}
          onFilterChange={() => undefined}
          disabled
        />
        <h2 className="mb-4 text-lg font-semibold">{t("floor_filter_all")}</h2>
        <TableTimeline tables={[]} pending onSelect={() => undefined} />
      </Tabs.Root>
    </>
  );
}
