import * as Disclosure from "../../components/ui/disclosure";
import { calendarDate } from "../../i18n/format";
import { CustomerVisits } from "./customer-visits";
import { customerConsentVersion } from "@tablecast/api/schema";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerStoreOptions } from "./customer-query";
import { customerPointsOptions } from "./customer-points-query";
import { customerCouponsOptions } from "./customer-coupons-query";

type CustomerStoreData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof customerStoreOptions>["queryFn"]>>
>;

export function CustomerConsent({
  storeId,
  onEnrolled,
}: {
  storeId: string;
  onEnrolled?: () => void;
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
  return (
    <div key={storeId} className="space-y-9">
      <header className="space-y-3 pb-2">
        <p className="text-sm text-muted-foreground">{t("customer_card")}</p>
        <h1 className="text-3xl font-semibold tracking-tight wrap-break-word">{data.store.name}</h1>
        {data.membership?.active && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-success">{t("customer_membership_active")}</span>
            <span className="text-muted-foreground">
              {t("customer_since")} {calendarDate(data.membership.joinedAt, locale)}
            </span>
          </div>
        )}
      </header>
      {data.membership?.active ? (
        <>
          <CustomerBenefits key={storeId} storeId={storeId} />
          <CustomerVisits storeId={storeId} />
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
        <ErrorNotice
          error={points.error}
          onRetry={() => void points.refetch()}
          retrying={points.isFetching}
        />
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
        <ErrorNotice
          error={coupons.error}
          onRetry={() => void coupons.refetch()}
          retrying={coupons.isFetching}
        />
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

function CustomerPreferences({ data }: { data: CustomerStoreData }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveTrigger = useRef<HTMLButtonElement>(null);
  const membership = data.membership;
  const preferences = useMutation({
    mutationFn: (json: {
      revision: number;
      shareCompanions: boolean;
      useMemories: boolean;
      saveMemories: boolean;
    }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].preferences.$post({
          param: { storeId: data.store.id },
          json,
        }),
      ),
    onSuccess: (result) => {
      client.setQueryData(customerStoreOptions(data.store.id).queryKey, result);
      if (result.membership)
        form.reset({
          shareCompanions: result.membership.shareCompanions,
          useMemories: result.membership.useMemories,
          saveMemories: result.membership.saveMemories,
        });
    },
  });
  const leave = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].leave.$post({
          param: { storeId: data.store.id },
          json: { revision: membership?.revision ?? 0 },
        }),
      ),
    onSuccess: async () => {
      client.removeQueries({ queryKey: ["tablecast-customer", data.store.id] });
      await client.invalidateQueries({ queryKey: ["tablecast-customer", "memberships"] });
      await navigate({ to: "/member" });
    },
  });
  const form = useAppForm({
    defaultValues: {
      shareCompanions: membership?.shareCompanions ?? false,
      useMemories: membership?.useMemories ?? false,
      saveMemories: membership?.saveMemories ?? false,
    },
    onSubmit: async ({ value }) => {
      await preferences
        .mutateAsync({ ...value, revision: membership?.revision ?? 0 })
        .catch(() => undefined);
    },
  });
  return (
    <section className="space-y-6 pt-4">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {(["shareCompanions", "useMemories", "saveMemories"] as const).map((name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <label className="flex min-h-12 items-center gap-3">
                <Checkbox
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                  disabled={preferences.isPending || leave.isPending}
                />
                {t(
                  name === "shareCompanions"
                    ? "customer_share_companions"
                    : name === "useMemories"
                      ? "customer_use_memories"
                      : "customer_save_memories",
                )}
              </label>
            )}
          </form.Field>
        ))}
        <form.AppForm>
          <form.SubmitButton disabled={leave.isPending}>
            {t("customer_save_preferences")}
          </form.SubmitButton>
        </form.AppForm>
        <ActionFeedback
          pending={preferences.isPending}
          error={preferences.error}
          success={preferences.isSuccess}
          successMessage={t("account_saved")}
        />
      </form>
      <div className="space-y-3 border-t border-border pt-6">
        <Button
          ref={leaveTrigger}
          variant="outline"
          aria-expanded={confirmLeave}
          disabled={leave.isPending || preferences.isPending || confirmLeave}
          onClick={() => setConfirmLeave(true)}
        >
          {t("customer_leave")}
        </Button>
        {confirmLeave && (
          <div className="space-y-3 rounded-xl border border-destructive-border bg-destructive-soft p-4">
            <p className="text-sm">{t("customer_leave_notice")}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={leave.isPending}
                onClick={() => {
                  setConfirmLeave(false);
                  requestAnimationFrame(() => leaveTrigger.current?.focus());
                }}
              >
                {t("common_cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={leave.isPending || preferences.isPending}
                onClick={() => leave.mutate()}
              >
                {t("customer_leave_confirm")}
              </Button>
            </div>
          </div>
        )}
        <ActionFeedback
          pending={leave.isPending}
          error={leave.error}
          success={false}
          successMessage={t("account_saved")}
        />
      </div>
    </section>
  );
}
