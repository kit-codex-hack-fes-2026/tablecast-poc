import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { customerPointsOptions } from "./customer-points-query";
const dates = {
  ja: new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }),
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Tokyo" }),
};
export function CustomerPoints({ storeId }: { storeId: string }) {
  const { t, locale } = useI18n();
  const query = useSuspenseInfiniteQuery(customerPointsOptions(storeId));
  const data = query.data.pages[0];
  return (
    <article className="space-y-6">
      <header className="space-y-4 border-b pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("customer_points")}</h1>
        <p className="text-sm text-muted-foreground">{t("customer_points_balance")}</p>
        <p className="text-4xl font-semibold tracking-tight tabular-nums">
          {(data?.balance ?? 0).toLocaleString(locale)}{" "}
          <span className="text-base font-medium">pt</span>
        </p>
        <p className="text-sm text-muted-foreground">{t("customer_points_no_expiry")}</p>
      </header>
      {(data?.balance ?? 0) < 0 && <p>{t("customer_points_negative")}</p>}
      <p className="text-sm text-muted-foreground">{t("customer_points_allocation_note")}</p>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt>{t("customer_points_visits")}</dt>
          <dd className="shrink-0 tabular-nums">
            {(data?.totals.visits ?? 0).toLocaleString(locale)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{t("customer_points_purchase")}</dt>
          <dd className="shrink-0 tabular-nums">
            ¥{(data?.totals.allocatedYen ?? 0).toLocaleString(locale)}
          </dd>
        </div>
      </dl>
      <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
      <ul className="divide-y">
        {query.data.pages.flatMap((page) =>
          page.entries.map((entry) => (
            <li key={entry.id} className="flex justify-between gap-4 py-4">
              <span>
                {entry.reasonKind === "manual"
                  ? entry.reason
                  : t(`customer_point_entry_${entry.reasonKind}`)}
                <small className="block text-muted-foreground">
                  {dates[locale].format(entry.createdAt)}
                </small>
              </span>
              <strong className="shrink-0 tabular-nums">
                {entry.delta > 0 ? "+" : ""}
                {entry.delta} pt
              </strong>
            </li>
          )),
        )}
      </ul>
      {!data?.entries.length && <p>{t("common_empty")}</p>}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("customer_more")}
        </Button>
      )}
    </article>
  );
}
