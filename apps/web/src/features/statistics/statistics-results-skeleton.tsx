import type { StatisticsSearch } from "./statistics-query";
import { Skeleton } from "../../components/ui/skeleton";
import { useI18n } from "../../i18n/locale";
import { StatisticsSummary } from "./statistics-summary";
import { StatisticsTable } from "./statistics-table";

/** タブと期間操作を残し、取得中の集計本文だけを同じ構造で予約する。 */
export function StatisticsResultsSkeleton({
  view,
  showToolbar = true,
}: {
  showToolbar?: boolean;
  view: StatisticsSearch["view"];
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-6" role="status" aria-label={t("common_loading")}>
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3" aria-hidden>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-11 w-40" />
        </div>
      )}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-hidden>
        <StatisticsSummary detailed={view === "summary"} />
        <p className="mt-4 text-xs text-muted-foreground">{t("statistics_limitations")}</p>
      </section>
      {view !== "summary" && (
        <section className="space-y-4" aria-hidden>
          <h2 className="text-lg font-semibold">{t(`statistics_view_${view}`)}</h2>
          <p className="text-sm text-muted-foreground">{t("statistics_page_basis")}</p>
          <p className="text-xs text-muted-foreground">{t("statistics_order_basis")}</p>
          <Skeleton className="h-64 w-full rounded-xl" />
          <StatisticsTable rows={[]} view={view} pending />
        </section>
      )}
    </div>
  );
}
