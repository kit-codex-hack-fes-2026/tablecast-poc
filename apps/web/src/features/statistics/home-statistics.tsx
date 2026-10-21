import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { calendarDate } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { statisticsOptions } from "./statistics-query";
import { StatisticsSummary } from "./statistics-summary";

export function HomeStatistics({ storeId, today }: { storeId: string; today: string }) {
  const { t, locale } = useI18n();
  const query = useInfiniteQuery(
    statisticsOptions(storeId, { from: today, to: today }, "summary", locale),
  );
  const result = query.data?.pages[0];
  return (
    <section
      className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
      aria-labelledby="tablecast-home-summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tablecast-home-summary" className="text-lg font-semibold">
            {t("home_closed_today")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("statistics_basis")}</p>
        </div>
        <Button
          variant="link"
          size="text"
          nativeButton={false}
          role="link"
          render={
            <Link
              to="/admin/stores/$storeId/statistics"
              params={{ storeId }}
              search={{ period: "today", view: "summary", from: today, to: today }}
            />
          }
        >
          {t("home_open_statistics")}
          <ArrowRight className="size-4" />
        </Button>
      </div>
      <ErrorNotice query={query} retrying={query.isFetching} />
      {query.isPending && (
        <div
          role="status"
          aria-label={t("common_loading")}
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          {[1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-20" />
          ))}
        </div>
      )}
      {result && (
        <>
          <StatisticsSummary summary={result.summary} />
          {result.summary.sessions === 0 && (
            <p className="text-sm text-muted-foreground">{t("statistics_empty")}</p>
          )}
          {result.summary.incompleteSnapshots > 0 && (
            <p className="text-sm text-warning">{t("statistics_missing")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {calendarDate(today, locale)}
            <br />
            {t("statistics_generated")}: <DateTime value={result.generatedAt} />
          </p>
        </>
      )}
    </section>
  );
}
