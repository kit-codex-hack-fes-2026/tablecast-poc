import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, QrCode, Store } from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { calendarDate } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { customerMembershipsOptions } from "./customer-query";

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
        <ul className="space-y-3">
          {data.map((membership) => (
            <li key={membership.id}>
              <Link
                to="/member/$storeId"
                params={{ storeId: membership.storeId }}
                className="flex min-h-24 items-center justify-between gap-4 rounded-xl border border-control-edge bg-control p-5 shadow-control transition-colors hover:bg-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Store aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold wrap-break-word">{membership.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("customer_since")} {calendarDate(membership.joinedAt, locale)}
                  </p>
                  <p className="mt-1 text-sm font-medium">{t("customer_card_view")}</p>
                </div>
                <ArrowRight aria-hidden className="size-5 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4 rounded-2xl border border-border border-dashed p-8 text-center">
          <QrCode aria-hidden className="mx-auto size-10 text-muted-foreground" />
          <p className="text-balance">{t("customer_empty")}</p>
        </div>
      )}
      <ErrorNotice query={memberships} />
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
