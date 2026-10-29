import { customerConsentVersion } from "@tablecast/api/schema";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { MembershipCard } from "../../components/membership-card";
import { PwaInstallHelp } from "../../components/pwa";
import { Button } from "../../components/ui/button";
import * as Disclosure from "../../components/ui/disclosure";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerCouponsOptions } from "./customer-coupons-query";
import { customerPointsOptions } from "./customer-points-query";
import { customerStoreOptions } from "./customer-query";
import { CustomerPreferences } from "./customer-store-preferences";
import { CustomerVisits } from "./customer-visits";

export function CustomerConsent({
  storeId,
  onEnrolled,
}: {
  onEnrolled?: () => void;
  storeId: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const enrol = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].enrol.$post({
          param: { storeId },
          json: { consentVersion: customerConsentVersion },
        }),
      ),
    onSuccess: async (data) => {
      client.setQueryData(customerStoreOptions(storeId).queryKey, data);
      await client.invalidateQueries({ queryKey: ["tablecast-customer", "memberships"] });
      onEnrolled?.();
    },
  });
  return (
    <section className="space-y-5 pt-6">
      <h2 className="text-xl font-semibold">{t("customer_consent_title")}</h2>
      <p className="leading-relaxed text-muted-foreground">{t("customer_consent_intro")}</p>
      <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed">
        <li>{t("customer_consent_companions")}</li>
        <li>{t("customer_consent_use")}</li>
        <li>{t("customer_consent_save")}</li>
      </ul>
      <p className="text-sm text-muted-foreground">{t("customer_consent_change")}</p>
      <Button
        className="w-full"
        size="lg"
        disabled={enrol.isPending}
        onClick={() => enrol.mutate()}
      >
        {t("customer_enrol")}
      </Button>
      <ActionFeedback
        pending={enrol.isPending}
        error={enrol.error}
        success={false}
        successMessage={t("account_saved")}
      />
    </section>
  );
}

export function CustomerStore({ storeId }: { storeId: string }) {
  const { data } = useSuspenseQuery(customerStoreOptions(storeId));
  const { t } = useI18n();
  return (
    <div key={storeId} className="space-y-9">
      {data.membership?.active ? (
        <MembershipCard
          storeId={storeId}
          storeName={data.store.name}
          memberName={data.memberName}
          joinedAt={data.membership.joinedAt}
          branding={data.store.branding}
        />
      ) : (
        <header className="space-y-3 pb-2">
          <p className="text-sm text-muted-foreground">{t("customer_card")}</p>
          <h1 className="text-3xl font-semibold tracking-tight wrap-break-word">
            {data.store.name}
          </h1>
        </header>
      )}
      {data.membership?.active ? (
        <>
          <CustomerBenefits key={storeId} storeId={storeId} />
          <CustomerVisits storeId={storeId} />
          <Disclosure.Root className="rounded-xl bg-secondary/60 px-4">
            <Disclosure.Trigger className="flex min-h-12 cursor-pointer items-center text-sm font-medium">
              {t("customer_install_title")}
            </Disclosure.Trigger>
            <Disclosure.Panel>
              <p className="text-sm text-muted-foreground">{t("customer_store_install_hint")}</p>
              <PwaInstallHelp />
            </Disclosure.Panel>
          </Disclosure.Root>
          <nav aria-label={t("customer_personal_records")} className="space-y-3">
            <Link
              className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-control-edge bg-control px-4 py-3 font-medium shadow-control transition-colors hover:bg-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              to="/member/$storeId/memories"
              params={{ storeId }}
            >
              {t("customer_memories")}
              <ArrowRight aria-hidden className="size-4 shrink-0" />
            </Link>
            <Link
              className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-control-edge bg-control px-4 py-3 font-medium shadow-control transition-colors hover:bg-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              to="/member/$storeId/consumption"
              params={{ storeId }}
            >
              {t("customer_consumption")}
              <ArrowRight aria-hidden className="size-4 shrink-0" />
            </Link>
          </nav>
          <Disclosure.Root className="group rounded-xl bg-secondary/60 px-4">
            <Disclosure.Trigger className="flex min-h-12 cursor-pointer items-center justify-between gap-4 text-sm font-medium">
              {t("customer_preferences")}
            </Disclosure.Trigger>
            <Disclosure.Panel>
              <CustomerPreferences key={data.membership.id} data={data} />
            </Disclosure.Panel>
          </Disclosure.Root>
        </>
      ) : (
        <CustomerConsent storeId={storeId} />
      )}
    </div>
  );
}

function CustomerBenefits({ storeId }: { storeId: string }) {
  const { t, locale } = useI18n();
  const points = useInfiniteQuery(customerPointsOptions(storeId));
  const coupons = useInfiniteQuery(customerCouponsOptions(storeId));
  const recentCoupons = coupons.data?.pages.flatMap((page) => page.coupons).slice(0, 2);
  return (
    <div className="grid gap-7 rounded-2xl bg-card p-5 shadow-xs sm:grid-cols-2 sm:p-6">
      <section aria-labelledby="customer-balance-title" className="space-y-3">
        <h2 id="customer-balance-title" className="text-sm font-medium text-muted-foreground">
          {t("customer_points_balance")}
        </h2>
        {points.isPending ? (
          <LoadingState />
        ) : (
          points.data && (
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {points.data.pages[0]?.balance.toLocaleString(locale)}{" "}
              <span className="text-base font-medium">pt</span>
            </p>
          )
        )}
        <ErrorNotice query={points} retrying={points.isFetching} />
        <Link
          to="/member/$storeId/points"
          params={{ storeId }}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium hover:text-primary"
        >
          {t("customer_points_history")}
          <ArrowRight aria-hidden className="size-4 shrink-0" />
        </Link>
      </section>
      <section aria-labelledby="customer-coupons-title" className="space-y-3">
        <h2 id="customer-coupons-title" className="text-sm font-medium text-muted-foreground">
          {t("customer_owned_coupons")}
        </h2>
        {coupons.isPending ? (
          <LoadingState />
        ) : (
          <ul className="space-y-3">
            {recentCoupons?.map((coupon) => (
              <li key={coupon.id} className="space-y-1">
                <p className="font-medium wrap-break-word">{coupon.rules.title[locale]}</p>
                <p className="text-sm text-muted-foreground">
                  {t(`coupon_${coupon.state}`)}
                  {!coupon.inDate && ` · ${t("coupon_expired")}`}
                </p>
              </li>
            ))}
          </ul>
        )}
        {recentCoupons?.length === 0 && !coupons.error && (
          <p className="text-sm text-muted-foreground">{t("customer_owned_coupons_empty")}</p>
        )}
        <ErrorNotice query={coupons} retrying={coupons.isFetching} />
        <Link
          to="/member/$storeId/coupons"
          params={{ storeId }}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium hover:text-primary"
        >
          {t("customer_coupons_and_rewards")}
          <ArrowRight aria-hidden className="size-4 shrink-0" />
        </Link>
      </section>
    </div>
  );
}
