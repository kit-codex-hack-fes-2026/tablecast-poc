import { ChartNoAxesCombined, RefreshCw } from "lucide-react";
import { calendarDate } from "../../i18n/format";
import { barX, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { StatisticsResult } from "@tablecast/api/schema";
import { useMemo, useRef } from "react";
import { useAppForm } from "../../components/form";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import {
  statisticsOptions,
  statisticsPeriod,
  statisticsRange,
  type StatisticsSearch,
} from "./statistics-query";
import { StatisticsSummary } from "./statistics-summary";
import { useStore } from "./store-shell";

const percentages = {
  ja: new Intl.NumberFormat("ja-JP", { style: "percent", maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }),
};

export function StoreStatistics({
  search,
  today,
  onNavigate,
}: {
  search: StatisticsSearch;
  today: string;
  onNavigate: (search: StatisticsSearch) => void;
}) {
  const { t } = useI18n();
  const store = useStore();
  const range = statisticsRange(search, today);
  const manager = ["owner", "admin"].includes(store.role);
  return (
    <>
      <PageHeader
        title={t("statistics_title")}
        icon={<ChartNoAxesCombined />}
        description={t("statistics_basis")}
      />
      {!manager ? (
        <p>{t("statistics_permission")}</p>
      ) : (
        <>
          <section className="space-y-4" aria-label={t("statistics_period")}>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("statistics_period")}>
              {(["today", "week", "month", "custom"] as const).map((period) => (
                <Button
                  key={period}
                  variant={search.period === period ? "secondary" : "outline"}
                  aria-pressed={search.period === period}
                  onClick={() =>
                    onNavigate({
                      ...search,
                      period,
                      ...(period === "custom"
                        ? (range ?? statisticsPeriod("today", today))
                        : statisticsPeriod(period, today)),
                    })
                  }
                >
                  {t(`statistics_period_${period}`)}
                </Button>
              ))}
            </div>
            {search.period === "custom" && (
              <PeriodForm
                key={`${search.from}:${search.to}`}
                from={search.from ?? today}
                to={search.to ?? today}
                onSubmit={(values) => onNavigate({ ...search, ...values })}
              />
            )}
            {!range && (
              <p role="alert" className="text-sm text-destructive">
                {t("statistics_invalid_range")}
              </p>
            )}
            <div
              className="flex flex-wrap gap-2 border-b border-border pb-4"
              role="group"
              aria-label={t("statistics_view")}
            >
              {(["summary", "products", "modifiers"] as const).map((view) => (
                <Button
                  key={view}
                  variant={search.view === view ? "default" : "ghost"}
                  aria-pressed={search.view === view}
                  onClick={() => onNavigate({ ...search, view })}
                >
                  {t(`statistics_view_${view}`)}
                </Button>
              ))}
            </div>
          </section>
          {range && (
            <StatisticsResults
              key={`${store.id}:${range.from}:${range.to}:${search.view}`}
              storeId={store.id}
              range={range}
              view={search.view}
            />
          )}
        </>
      )}
    </>
  );
}

function PeriodForm({
  from,
  to,
  onSubmit,
}: {
  from: string;
  to: string;
  onSubmit: (range: { from: string; to: string }) => void;
}) {
  const { t } = useI18n();
  const endInput = useRef<HTMLInputElement>(null);
  const form = useAppForm({
    defaultValues: { from, to },
    onSubmitInvalid: () => endInput.current?.focus(),
    validators: {
      onSubmit: ({ value }) =>
        value.from && value.to && value.from <= value.to
          ? undefined
          : { fields: { to: t("statistics_invalid_range") } },
    },
    onSubmit: ({ value }) => onSubmit(value),
  });
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="from">
        {(field) => <field.DateField required label={t("statistics_from")} />}
      </form.AppField>
      <form.AppField name="to">
        {(field) => <field.DateField ref={endInput} required label={t("statistics_to")} />}
      </form.AppField>
      <Button type="submit" variant="outline">
        {t("statistics_apply")}
      </Button>
    </form>
  );
}

function StatisticsResults({
  storeId,
  range,
  view,
}: {
  storeId: string;
  range: { from: string; to: string };
  view: StatisticsSearch["view"];
}) {
  const { t, locale } = useI18n();
  const query = useInfiniteQuery(statisticsOptions(storeId, range, view, locale));
  const result = query.data?.pages[0];
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.rows) ?? [], [query.data]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-baseline gap-x-2 font-medium tabular-nums">
          <time className="whitespace-nowrap" dateTime={range.from}>
            {calendarDate(range.from, locale)}
          </time>
          {range.from !== range.to && (
            <>
              <span>{locale === "ja" ? "から" : "to"}</span>
              <time className="whitespace-nowrap" dateTime={range.to}>
                {calendarDate(range.to, locale)}
              </time>
            </>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          aria-busy={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className="size-4" />
          {t("statistics_refresh")}
        </Button>
      </div>
      <ErrorNotice
        error={query.error}
        retrying={query.isFetching}
        onRetry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
      />
      {query.isPending && <LoadingState />}
      {result && (
        <>
          {!!query.error && (
            <p className="text-sm text-muted-foreground">{t("statistics_stale")}</p>
          )}
          <section
            aria-label={t("statistics_view_summary")}
            className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          >
            <StatisticsSummary summary={result.summary} detailed={view === "summary"} />
            <p className="mt-4 text-xs text-muted-foreground">{t("statistics_limitations")}</p>
            {result.summary.sessions === 0 && (
              <p className="mt-6 text-sm text-muted-foreground">{t("statistics_empty")}</p>
            )}
          </section>
          {result.summary.incompleteSnapshots > 0 && (
            <p
              role="note"
              className="rounded-xl border border-warning-border bg-warning-soft p-4 text-sm"
            >
              {t("statistics_missing")}: {result.summary.incompleteSnapshots.toLocaleString(locale)}
            </p>
          )}
          {view !== "summary" && (
            <section className="space-y-4" aria-label={t(`statistics_view_${view}`)}>
              <div>
                <h2 className="text-lg font-semibold">{t(`statistics_view_${view}`)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("statistics_page_basis")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statistics_order_basis")}</p>
              </div>
              {rows.length ? (
                <>
                  <QuantityChart rows={rows} />
                  {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- 明細表の横スクロールをSafariでも標準キーで操作可能にする。 */}
                  <div
                    className="overflow-x-auto rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-ring"
                    tabIndex={0}
                    role="region"
                    aria-label={t("statistics_table")}
                  >
                    <table className="w-full text-sm tabular-nums">
                      <caption className="sr-only">
                        {t(`statistics_view_${view}`)} · {calendarDate(range.from, locale)}{" "}
                        {locale === "ja" ? "から" : "to"} {calendarDate(range.to, locale)}
                      </caption>
                      <thead className="bg-secondary/60 text-left">
                        <tr>
                          {(
                            [
                              "item",
                              "quantity",
                              "orderingSessions",
                              "orderRate",
                              "planCoveredQuantity",
                            ] as const
                          ).map((key) => (
                            <th
                              key={key}
                              scope="col"
                              className={`px-4 py-3 font-medium whitespace-nowrap ${key === "item" ? "text-left" : "text-right"}`}
                            >
                              {t(`statistics_${key}`)}
                              {key === "quantity" && (
                                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                  {t(
                                    view === "modifiers"
                                      ? "statistics_option_quantity_hint"
                                      : "statistics_quantity_hint",
                                  )}
                                </span>
                              )}
                              {key === "orderRate" && (
                                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                  {t("statistics_rate_basis")}
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={`${row.productId}:${row.optionId}`}
                            className="border-t border-border"
                          >
                            <th
                              scope="row"
                              className="min-w-48 max-w-96 p-4 text-left font-medium wrap-anywhere"
                            >
                              {row.name ?? t("statistics_unknown")}
                            </th>
                            <td className="p-4 text-right">
                              {row.quantity.toLocaleString(locale)}
                            </td>
                            <td className="p-4 text-right">
                              {row.orderingSessions.toLocaleString(locale)}
                            </td>
                            <td className="p-4 text-right">
                              {row.orderRate === null
                                ? t("statistics_unavailable")
                                : percentages[locale].format(row.orderRate)}
                            </td>
                            <td className="p-4 text-right">
                              {row.planCoveredQuantity.toLocaleString(locale)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
                  <p className="text-sm text-muted-foreground">
                    {rows.length.toLocaleString(locale)}{" "}
                    {t(query.hasNextPage ? "statistics_partial" : "statistics_all_loaded")}
                  </p>
                </>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">
                  {t("statistics_no_items")}
                </p>
              )}
              {query.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  aria-busy={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  {t(query.isFetchingNextPage ? "common_loading" : "statistics_more")}
                </Button>
              )}
            </section>
          )}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              {t("statistics_snapshot")}: <DateTime value={result.asOf} /> ·{" "}
              {t("statistics_generated")}: <DateTime value={result.generatedAt} />
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function QuantityChart({ rows }: { rows: StatisticsResult["rows"] }) {
  const { t, locale } = useI18n();
  const definition = useMemo(() => {
    const points = rows.slice(0, 10).map((row) => ({
      ...row,
      key: `${row.productId}:${row.optionId}`,
      label: row.name ?? t("statistics_unknown"),
    }));
    const maximum = Math.max(1, ...points.map((point) => point.quantity));
    return defineChart({
      marks: [barX(points, { x: "quantity", y: "key", fill: "var(--color-primary)" })],
      scales: {
        x: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          domain: [0, maximum],
          axis: {
            ticks: { count: Math.min(maximum, 5), format: (value) => value.toLocaleString(locale) },
          },
        },
        y: {
          scale: () => scaleBand().padding(0.3),
          axis: {
            ticks: {
              format: (value) => {
                const name = points.find((row) => row.key === value)?.label ?? "";
                return name.length > 16 ? `${name.slice(0, 16)}…` : name;
              },
            },
          },
        },
      },
      svgAnimation: false,
      tooltip: {
        use: tooltip,
        format: (point) => `${point.datum.label} · ${point.datum.quantity.toLocaleString(locale)}`,
      },
    });
  }, [rows, locale, t]);
  return (
    <figure className="rounded-xl border border-border p-4">
      <figcaption className="mb-4 text-sm text-muted-foreground">
        {t("statistics_chart_scope")}
      </figcaption>
      <Chart
        definition={definition}
        height={Math.max(120, Math.min(rows.length, 10) * 32 + 50)}
        ariaLabel={t("statistics_quantity")}
        ariaDescription={t("statistics_chart_keyboard")}
      />
    </figure>
  );
}
