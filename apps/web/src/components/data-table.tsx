import {
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { type ReactNode, useEffect, useEffectEvent, useMemo, useState } from "react";
import type { DataTableColumn } from "./data-table-model";
import { useI18n } from "../i18n/locale";
import { TableControls, TablePagination } from "./data-table-controls";
import { TableMarkup } from "./data-table-markup";
import { features } from "./data-table-model";
import { ErrorNotice } from "./error-notice";

/**
 * 検索・ページ分割を備えた一覧。
 * data、columns、getRowIdが必須。
 * searchLabelで検索名、emptyで0件文、pending/error/onRetryで取得状態を指定する。
 * stateとonGlobalFilterChange/onPaginationChange/onSortingChangeでURL等へ同期できる。
 * searchPlaceholderは検索対象、tableLabelは横スクロール領域の名前を指定する。
 * 部分取得ではpagination=false、manualFilteringを実際のAPIに合わせる。
 * 取得した一部だけを全件集計と呼ばない。
 * 数値列はmeta.align=rightで見出しと値を右揃えにする。
 * 行全体をクリック領域にせず、対象名へリンクを置く。
 */
export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  searchLabel,
  searchPlaceholder,
  tableLabel,
  empty,
  pagination = true,
  pending = false,
  error,
  onRetry,
  state,
  onGlobalFilterChange,
  onPaginationChange,
  onPaginationClamp,
  onSortingChange,
  manualFiltering,
  filters,
  filtersActive = false,
  onReset,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  empty?: string;
  error?: unknown;
  filters?: ReactNode;
  filtersActive?: boolean;
  getRowId: (row: T) => string;
  manualFiltering?: boolean;
  onGlobalFilterChange?: OnChangeFn<string>;
  onPaginationChange?: OnChangeFn<PaginationState>;
  onPaginationClamp?: (pagination: PaginationState) => void;
  onReset?: () => void;
  onRetry?: () => void;
  onSortingChange?: OnChangeFn<SortingState>;
  pagination?: boolean;
  pending?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  state?: { globalFilter?: string; pagination?: PaginationState; sorting?: SortingState };
  tableLabel?: string;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const bounded = useBoundedPagination({
    enabled: pagination,
    ready: !pending && !error,
    requested: state?.pagination,
    onChange: onPaginationChange,
    onClamp: onPaginationClamp,
  });
  const table = useTable({
    features,
    data,
    columns,
    getRowId,
    state: {
      globalFilter: filter,
      ...state,
      ...bounded.state,
    },
    onGlobalFilterChange: onGlobalFilterChange ?? setFilter,
    ...bounded.options,
    ...(onSortingChange ? { onSortingChange } : {}),
    manualFiltering,
    globalFilterFn: "includesString",
    manualPagination: !pagination,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });
  bounded.syncPageCount(table.getPageCount());
  const initialPending = pending && !data.length;
  if (error && !data.length && !pending)
    return (
      <div className="min-h-80">
        <ErrorNotice error={error} onRetry={onRetry} />
      </div>
    );
  return (
    <div className="min-h-80 space-y-3" aria-busy={pending}>
      {pending && (
        <span role="status" className="sr-only">
          {t("common_loading")}
        </span>
      )}
      <TableControls
        table={table}
        searchLabel={searchLabel}
        searchPlaceholder={searchPlaceholder}
        searchValue={state?.globalFilter ?? filter}
        filters={filters}
        filtersActive={filtersActive}
        pending={initialPending}
        onReset={onReset}
        resetPageOnSearch={!onGlobalFilterChange}
        resetPageOnSort={!onSortingChange}
      />
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- 横スクロール領域をSafariでもキーボード操作できるようにする。 */}
      <div
        tabIndex={tableLabel ? 0 : undefined}
        role={tableLabel ? "region" : undefined}
        aria-label={tableLabel}
        className="min-h-48 overflow-x-auto rounded-xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring"
      >
        <TableMarkup
          table={table}
          pending={initialPending}
          empty={empty ?? t("common_no_results")}
        />
      </div>
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
      {pagination && <TablePagination table={table} pending={pending} />}
    </div>
  );
}

function useBoundedPagination({
  enabled,
  ready,
  requested,
  onChange,
  onClamp,
}: {
  enabled: boolean;
  onChange?: OnChangeFn<PaginationState>;
  onClamp?: (pagination: PaginationState) => void;
  ready: boolean;
  requested?: PaginationState;
}) {
  const [lastPageIndex, setLastPageIndex] = useState<null | number>(null);
  const effective = useMemo(
    () =>
      enabled && requested && lastPageIndex !== null
        ? { ...requested, pageIndex: Math.min(requested.pageIndex, lastPageIndex) }
        : requested,
    [enabled, requested, lastPageIndex],
  );
  const normalizeUrl = useEffectEvent((value: PaginationState) => (onClamp ?? onChange)?.(value));
  // URLという外部状態の正規化だけをcommit後に行う。取得中・失敗時は元のURLを維持する。
  useEffect(() => {
    if (enabled && ready && requested && effective && requested.pageIndex !== effective.pageIndex)
      // oxlint-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent -- 表示用stateの転送ではなく、描画中に変更できないRouterのURLを正規化する。
      normalizeUrl(effective);
  }, [enabled, ready, requested, effective]);
  return {
    state: effective ? { pagination: effective } : {},
    options: onChange
      ? {
          onPaginationChange: (next: Parameters<OnChangeFn<PaginationState>>[0]) =>
            onChange(typeof next === "function" && effective ? next(effective) : next),
          autoResetPageIndex: false,
        }
      : {},
    syncPageCount: (count: number) => {
      const next = Math.max(0, count - 1);
      // Reactの条件付きlocal state調整で再描画し、SSRも空ページを確定しない。
      if (enabled && ready && requested && lastPageIndex !== next) setLastPageIndex(next);
    },
  };
}
