import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, QrCode } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ErrorNotice } from "../../components/error-notice";
import { useI18n } from "../../i18n/locale";
import { customerMembershipsOptions } from "./customer-query";
const dates = {
  ja: new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo" }),
};

export function CustomerMemberships() {
  const { t, locale } = useI18n();
  const memberships = useSuspenseInfiniteQuery(customerMembershipsOptions);
  const data = memberships.data.pages.flatMap((page) => page.memberships);
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{t("customer_title")}</h1>
        <p className="text-muted-foreground">{t("customer_intro")}</p>
      </div>
      {data.length ? (
        <ul className="divide-y border-y">
          {data.map((membership) => (
            <li key={membership.id}>
              <Link
                to="/member/$storeId"
                params={{ storeId: membership.storeId }}
                className="flex min-h-24 items-center justify-between gap-4 py-5 hover:text-primary"
              >
                <div className="min-w-0">
                  <p className="text-lg font-semibold wrap-anywhere">{membership.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("customer_since")} {dates[locale].format(membership.joinedAt)}
                  </p>
                </div>
                <ArrowUpRight aria-hidden className="size-5 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4 rounded-2xl border border-dashed p-8 text-center">
          <QrCode aria-hidden className="mx-auto size-10 text-muted-foreground" />
          <p>{t("customer_empty")}</p>
        </div>
      )}
      <ErrorNotice error={memberships.error} onRetry={() => void memberships.refetch()} />
      {memberships.hasNextPage && (
        <Button
          variant="outline"
          disabled={memberships.isFetchingNextPage}
          onClick={() => void memberships.fetchNextPage()}
        >
          {t("customer_more")}
        </Button>
      )}
    </section>
  );
}
