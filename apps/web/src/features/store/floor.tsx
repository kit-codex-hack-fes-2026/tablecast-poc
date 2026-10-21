import {
  LayoutDashboard,
  LayoutGrid,
  GanttChart,
  Table2,
  CircleDot,
  Clock3,
  Users,
  CircleDollarSign,
  ArrowDownUp,
  Bell,
  TriangleAlert,
  Radio,
  CircleDashed,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { tv } from "tailwind-variants";
import { useCallback } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useHydrated } from "@tanstack/react-router";
import * as Tabs from "../../components/ui/tabs";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { CollectionSort } from "../../components/collection-sort";
import { CollectionToolbar } from "../../components/collection-toolbar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";
import { floorOptions } from "./store-query";

import { useRealtime } from "../../lib/use-realtime";
import { TableMetrics } from "./table-metrics";
import { TableTimeline } from "./table-timeline";
import { useStore } from "./store-shell";
import { FloorTimeline } from "./floor-timeline";
import {
  storeDate,
  floorSortValues,
  type FloorSearch,
  type FloorFilter,
  type FloorSort,
} from "./floor-model";

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
      <ErrorNotice error={state.error} onRetry={() => void state.refetch()} />

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

function FloorControls({
  view,
  filter,
  search,
  sort,
  onSortChange,
  onReset,
  onSearchChange,
  onFilterChange,
  disabled,
}: {
  view: "list" | "timeline";
  filter: FloorFilter;
  search: string;
  sort?: FloorSort;
  onSortChange: (value: FloorSort | undefined) => void;
  onReset: () => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: FloorFilter) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const filterIcons: Record<FloorFilter, LucideIcon> = {
    all: Layers,
    attention: TriangleAlert,
    active: Users,
    called: Bell,
    billing: CircleDollarSign,
    voice: Radio,
    vacant: CircleDashed,
  };
  const FilterIcon = filterIcons[filter];
  const fields = [
    { value: "table", label: t("floor_table"), icon: Table2 },
    { value: "status", label: t("floor_sort_status"), icon: CircleDot },
    { value: "duration", label: t("floor_sort_duration"), icon: Clock3 },
    { value: "guests", label: t("floor_sort_guests"), icon: Users },
    { value: "due", label: t("admin_due"), icon: CircleDollarSign },
  ];
  const sortOptions = [
    { value: "", label: t("collection_sort_default"), icon: ArrowDownUp },
    ...fields.flatMap((field) => [
      {
        ...field,
        value: `${field.value}:asc`,
        label: `${field.label} · ${t("collection_sort_ascending")}`,
      },
      {
        ...field,
        value: `${field.value}:desc`,
        label: `${field.label} · ${t("collection_sort_descending")}`,
      },
    ]),
  ];
  const filters = (
    ["all", "attention", "active", "called", "billing", "voice", "vacant"] as const
  ).map((value) => ({ value, label: t(`floor_filter_${value}`), icon: filterIcons[value] }));
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="shrink-0 text-sm font-medium">{t("floor_view")}</p>
        <Tabs.List aria-label={t("floor_view")}>
          <Tabs.Tab value="list" disabled={disabled}>
            <LayoutGrid aria-hidden />
            {t("floor_list")}
          </Tabs.Tab>
          <Tabs.Tab value="timeline" disabled={disabled}>
            <GanttChart aria-hidden />
            {t("floor_timeline")}
          </Tabs.Tab>
        </Tabs.List>
      </div>
      <CollectionToolbar
        disabled={disabled}
        search={{
          label: t("floor_search"),
          placeholder: t("floor_search_placeholder"),
          value: search,
          onChange: onSearchChange,
        }}
        filters={
          view === "list" && (
            <Select
              items={filters}
              value={filter}
              onValueChange={(next) => {
                if (next) onFilterChange(next);
              }}
              disabled={disabled}
            >
              <SelectTrigger aria-label={t("floor_filters")}>
                <span className="flex min-w-0 items-center gap-2 text-left">
                  <FilterIcon aria-hidden className="size-4 shrink-0" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {filters.map(({ value, label, icon: Icon }) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <Icon aria-hidden className="size-4 shrink-0" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
        sort={
          <CollectionSort
            options={sortOptions}
            value={sort ?? ""}
            onValueChange={(next) => onSortChange(floorSortValues.find((value) => value === next))}
            disabled={disabled}
          />
        }
        resetDisabled={!search && !sort && filter === "all"}
        onReset={onReset}
      />
    </div>
  );
}
