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
import { ProductImage } from "../../components/product-image";
import { PwaInstallHelp } from "../../components/pwa";
import { Button } from "../../components/ui/button";
import * as Disclosure from "../../components/ui/disclosure";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { OwnedCoupons } from "./customer-coupons";
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
  const { t, locale } = useI18n();
  const points = useInfiniteQuery({
    ...customerPointsOptions(storeId),
    enabled: Boolean(data.membership?.active),
  });
  return (
    <div key={storeId} className="space-y-6">
      {data.membership?.active ? (
        <MembershipCard
          storeId={storeId}
          storeName={data.store.name}
          memberName={data.memberName}
          joinedAt={data.membership.joinedAt}
          branding={data.store.branding}
          balance={points.data?.pages[0]?.balance}
          visitCount={points.data?.pages[0]?.totals.visits}
        >
          {points.isPending && <LoadingState />}
          <ErrorNotice query={points} retrying={points.isFetching} />
          <Link
            to="/member/$storeId/points"
            params={{ storeId }}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium hover:text-primary"
          >
            {t("customer_points_history")}
            <ArrowRight aria-hidden className="size-4 shrink-0" />
          </Link>
        </MembershipCard>
      ) : (
        <header className="flex items-center gap-3 pb-2">
          {data.store.branding?.logo && (
            <ProductImage
              src={`/api/member-stores/${encodeURIComponent(storeId)}/images/${data.store.branding.logo.imageKey}`}
              alt={data.store.branding.logo.alt[locale]}
              width={56}
              height={56}
              sizes="56px"
              priority
              className="size-14 shrink-0 rounded-xl object-contain"
            />
          )}
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{t("customer_card")}</p>
            <h1 className="text-xl font-semibold tracking-tight wrap-break-word">
              {data.store.name}
            </h1>
          </div>
        </header>
      )}
      {data.membership?.active ? (
        <>
          <div className="space-y-3">
            <OwnedCoupons storeId={storeId} compact />
            <Link
              to="/member/$storeId/coupons"
              params={{ storeId }}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium hover:text-primary"
            >
              {t("customer_coupons_and_rewards")}
              <ArrowRight aria-hidden className="size-4 shrink-0" />
            </Link>
          </div>
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
          <nav
            aria-label={t("customer_personal_records")}
            className="divide-y divide-border border-y border-border text-sm"
          >
            <Link
              className="flex min-h-12 items-center justify-between gap-4 py-3 font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              to="/member/$storeId/memories"
              params={{ storeId }}
            >
              {t("customer_memories")}
              <ArrowRight aria-hidden className="size-4 shrink-0" />
            </Link>
            <Link
              className="flex min-h-12 items-center justify-between gap-4 py-3 font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
