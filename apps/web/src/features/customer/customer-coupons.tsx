import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef } from "react";
import { CouponCard } from "../../components/coupon-card";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerCouponsOptions, customerExchangesOptions } from "./customer-coupons-query";

export function CustomerCoupons({ storeId, sessionId }: { storeId: string; sessionId?: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["tablecast-customer", storeId] });
  return (
    <article key={storeId} className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("coupons")}</h1>
      <p>{t("coupon_terms")}</p>
      {!sessionId && <p>{t("coupon_request_hint")}</p>}
      <OwnedCoupons storeId={storeId} sessionId={sessionId} onChanged={refresh} />
      <ExchangeCoupons storeId={storeId} onChanged={refresh} />
    </article>
  );
}

type CouponCollectionProps = { storeId: string; onChanged: () => Promise<void> };

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
      <ErrorNotice
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
      {(coupons.length > 0 || request.status !== "idle") && (
        <ActionFeedback
          pending={request.isPending}
          error={request.error}
          success={request.isSuccess}
          successMessage={t("coupon_requested")}
        />
      )}
      {query.isPending && <LoadingState />}
      {query.isSuccess && !coupons.length && <p>{t("customer_coupons_empty")}</p>}
      <div className="grid gap-5">
        {coupons.map((coupon) => (
          <CouponCard key={coupon.id} rules={coupon.rules}>
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
    mutationFn: ({ ruleId, idempotencyKey }: { ruleId: string; idempotencyKey: string }) =>
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
      <ErrorNotice
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
      {(rules.length > 0 || exchange.status !== "idle") && (
        <ActionFeedback
          pending={exchange.isPending}
          error={exchange.error}
          success={exchange.isSuccess}
          successMessage={t("account_saved")}
        />
      )}
      {query.isPending && <LoadingState />}
      {query.isSuccess && !rules.length && <p>{t("customer_exchanges_empty")}</p>}
      <div className="grid gap-5">
        {rules.map((rule) => (
          <CouponCard key={rule.id} rules={rule.rules}>
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
