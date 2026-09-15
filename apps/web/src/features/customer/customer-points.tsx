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
      <h1 className="text-2xl font-semibold">{t("customer_points")}</h1>
      <p className="text-4xl font-semibold">
        {data?.balance ?? 0} <span className="text-lg">pt</span>
      </p>
      <p>{t("customer_points_no_expiry")}</p>
      {(data?.balance ?? 0) < 0 && <p>{t("customer_points_negative")}</p>}
      <p className="text-sm text-muted-foreground">{t("customer_points_allocation_note")}</p>
      <dl className="space-y-2">
        <div className="flex justify-between">
          <dt>{t("customer_points_visits")}</dt>
          <dd>{data?.totals.visits ?? 0}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t("customer_points_purchase")}</dt>
          <dd>¥{data?.totals.allocatedYen ?? 0}</dd>
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
              <strong>
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
