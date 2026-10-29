import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { CouponCard } from "../../components/coupon-card";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerCouponsOptions, customerExchangesOptions } from "./customer-coupons-query";

export function CustomerCoupons({ storeId, sessionId }: { sessionId?: string; storeId: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["tablecast-customer", storeId] });
  return (
    <article key={storeId} className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("coupons")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("coupon_terms")}</p>
        <section className="space-y-2 rounded-xl bg-card p-4">
          <h2 className="font-medium">{t("customer_coupon_how")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(sessionId ? "customer_coupon_how_connected" : "customer_coupon_how_unconnected")}
          </p>
        </section>
      </header>
      <OwnedCoupons storeId={storeId} sessionId={sessionId} onChanged={refresh} />
      <ExchangeCoupons storeId={storeId} onChanged={refresh} />
    </article>
  );
}

type CouponCollectionProps = { onChanged: () => Promise<void>; storeId: string };

function OwnedCoupons({
  storeId,
  sessionId,
  onChanged,
}: CouponCollectionProps & { sessionId?: string }) {
  const { t } = useI18n();
  const title = useId();
  const query = useInfiniteQuery(customerCouponsOptions(storeId));
  const coupons = query.data?.pages.flatMap((page) => page.coupons) ?? [];
  const request = useMutation({
    mutationFn: (couponId: string) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].coupons[":couponId"].request.$post({
          param: { storeId, couponId },
          json: { sessionId: sessionId ?? "" },
        }),
      ),
    onSuccess: onChanged,
  });
  return (
    <section aria-labelledby={title} aria-busy={query.isPending} className="space-y-5">
      <h2 id={title} className="text-xl font-semibold">
        {t("customer_coupons_owned")}
      </h2>
      <ErrorNotice query={query} retrying={query.isFetching} />
      {(coupons.length > 0 || request.status !== "idle") && (
        <ActionFeedback mutation={request} successMessage={t("customer_coupon_requested_hint")} />
      )}
      {query.isPending && <LoadingState />}
      {query.isSuccess && !coupons.length && <p>{t("customer_coupons_empty")}</p>}
      <div className="grid gap-5">
        {coupons.map((coupon) => (
          <CouponCard storeId={storeId} key={coupon.id} rules={coupon.rules}>
            <p>{t(`coupon_${coupon.state}`)}</p>
            {!coupon.inDate ? (
              <p>{t("coupon_expired")}</p>
            ) : (
              sessionId &&
              (coupon.state === "available" || coupon.state === "requested") && (
                <Button
                  disabled={
                    request.isPending ||
                    (coupon.state === "requested" && coupon.requestedSessionId === sessionId)
                  }
                  onClick={() => request.mutate(coupon.id)}
                >
                  {t("coupon_request")}
                </Button>
              )
            )}
          </CouponCard>
        ))}
      </div>
      {query.hasNextPage && (
        <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t("customer_more")}
        </Button>
      )}
    </section>
  );
}

function ExchangeCoupons({ storeId, onChanged }: CouponCollectionProps) {
  const { t } = useI18n();
  const title = useId();
  const query = useInfiniteQuery(customerExchangesOptions(storeId));
  const rules = query.data?.pages.flatMap((page) => page.rules) ?? [];
  const keys = useRef<Record<string, string>>({});
  const exchange = useMutation({
    mutationFn: ({ ruleId, idempotencyKey }: { idempotencyKey: string; ruleId: string }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].coupons.exchange.$post({
          param: { storeId },
          json: { ruleId, idempotencyKey },
        }),
      ),
    onSuccess: async (_, input) => {
      keys.current[input.ruleId] = crypto.randomUUID();
      await onChanged();
    },
  });
  return (
    <section aria-labelledby={title} aria-busy={query.isPending} className="space-y-5">
      <h2 id={title} className="text-xl font-semibold">
        {t("coupon_exchange")}
      </h2>
      <ErrorNotice query={query} retrying={query.isFetching} />
      {(rules.length > 0 || exchange.status !== "idle") && (
        <ActionFeedback mutation={exchange} successMessage={t("account_saved")} />
      )}
      {query.isPending && <LoadingState />}
      {query.isSuccess && !rules.length && <p>{t("customer_exchanges_empty")}</p>}
      <div className="grid gap-5">
        {rules.map((rule) => (
          <CouponCard storeId={storeId} key={rule.id} rules={rule.rules}>
            <Button
              disabled={exchange.isPending}
              onClick={() => {
                const key = keys.current[rule.id] ?? crypto.randomUUID();
                keys.current[rule.id] = key;
                exchange.mutate({ ruleId: rule.id, idempotencyKey: key });
              }}
            >
              {t("coupon_exchange")} · {rule.rules.threshold} pt
            </Button>
          </CouponCard>
        ))}
      </div>
      {query.hasNextPage && (
        <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t("customer_more")}
        </Button>
      )}
    </section>
  );
}
