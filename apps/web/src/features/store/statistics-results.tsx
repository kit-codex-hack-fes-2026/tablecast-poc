import { RefreshCw, ChevronDown } from "lucide-react";
import { calendarDate } from "../../i18n/format";
import { barX, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { StatisticsResult } from "@tablecast/api/schema";
import { useMemo } from "react";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { statisticsOptions, type StatisticsSearch } from "./statistics-query";
import { StatisticsTable } from "./statistics-table";
import { StatisticsSummary } from "./statistics-summary";
import { StatisticsResultsSkeleton } from "./statistics-results-skeleton";

export default function StatisticsResults({
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
      {query.isPending && <StatisticsResultsSkeleton view={view} showToolbar={false} />}
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
                  <StatisticsTable rows={rows} view={view} />
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
                  <ChevronDown aria-hidden />
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
