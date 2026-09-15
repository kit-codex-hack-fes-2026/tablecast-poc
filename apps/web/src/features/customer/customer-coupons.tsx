import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { CouponCard } from "../../components/coupon-card";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerCouponsOptions, customerExchangesOptions } from "./customer-coupons-query";
export function CustomerCoupons({ storeId, sessionId }: { storeId: string; sessionId?: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const coupons = useInfiniteQuery(customerCouponsOptions(storeId));
  const exchanges = useInfiniteQuery(customerExchangesOptions(storeId));
  const keys = useRef<Record<string, string>>({});
  const refresh = () => client.invalidateQueries({ queryKey: ["tablecast-customer", storeId] });
  const request = useMutation({
    mutationFn: (couponId: string) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].coupons[":couponId"].request.$post({
          param: { storeId, couponId },
          json: { sessionId: sessionId ?? "" },
        }),
      ),
    onSuccess: refresh,
  });
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
      await refresh();
    },
  });
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("coupons")}</h1>
      <p>{t("coupon_terms")}</p>
      {!sessionId && <p>{t("coupon_request_hint")}</p>}
      <ErrorNotice error={coupons.error} onRetry={() => void coupons.refetch()} />
      <ActionFeedback
        pending={request.isPending}
        error={request.error}
        success={request.isSuccess}
        successMessage={t("coupon_requested")}
      />
      <div className="grid gap-5">
        {coupons.data?.pages.flatMap((page) =>
          page.coupons.map((coupon) => (
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
          )),
        )}
      </div>
      {coupons.hasNextPage && (
        <Button disabled={coupons.isFetchingNextPage} onClick={() => void coupons.fetchNextPage()}>
          {t("customer_more")}
        </Button>
      )}
      <h2 className="text-xl font-semibold">{t("coupon_exchange")}</h2>
      <ErrorNotice error={exchanges.error} onRetry={() => void exchanges.refetch()} />
      <ActionFeedback
        pending={exchange.isPending}
        error={exchange.error}
        success={exchange.isSuccess}
        successMessage={t("account_saved")}
      />
      <div className="grid gap-5">
        {exchanges.data?.pages.flatMap((page) =>
          page.rules.map((rule) => (
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
          )),
        )}
      </div>
      {exchanges.hasNextPage && (
        <Button
          disabled={exchanges.isFetchingNextPage}
          onClick={() => void exchanges.fetchNextPage()}
        >
          {t("customer_more")}
        </Button>
      )}
    </article>
  );
}
