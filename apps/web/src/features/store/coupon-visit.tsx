import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { useAppForm } from "../../components/form";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { visitCouponsOptions } from "./coupon-query";
export function CouponVisit({ storeId, sessionId }: { storeId: string; sessionId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const query = useQuery(visitCouponsOptions(storeId, sessionId));
  const keys = useRef<Record<string, string>>({});
  const apply = useMutation({
    mutationFn: ({ couponId, idempotencyKey }: { couponId: string; idempotencyKey: string }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].coupons.apply.$post({
          param: { storeId, id: sessionId },
          json: { couponId, idempotencyKey, expectedVersion: query.data?.expectedVersion ?? 0 },
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, sessionId] }),
  });
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <h3 className="font-semibold">{t("coupons")}</h3>
      <p className="text-sm text-muted-foreground">{t("coupon_bill_note")}</p>
      <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
      {query.data?.requested.map((coupon) => (
        <div key={coupon.id} className="space-y-2">
          <p>
            {coupon.name} · {coupon.rules.title[locale]}
          </p>
          <p>
            {coupon.rules.discountKind === "fixed"
              ? `¥${coupon.rules.discountValue}`
              : `${coupon.rules.discountValue}%`}{" "}
            · {t("coupon_minimum")}: ¥{coupon.rules.minimumYen}
          </p>
          <Button
            disabled={apply.isPending || !!query.data?.uses.length}
            onClick={() => {
              const key = keys.current[coupon.id] ?? crypto.randomUUID();
              keys.current[coupon.id] = key;
              apply.mutate({ couponId: coupon.id, idempotencyKey: key });
            }}
          >
            {t("coupon_apply")}
          </Button>
        </div>
      ))}
      <ActionFeedback
        pending={apply.isPending}
        error={apply.error}
        success={apply.isSuccess}
        successMessage={t("account_saved")}
      />
      {query.data?.uses.map((use) => (
        <CancelCoupon
          key={use.id}
          storeId={storeId}
          sessionId={sessionId}
          useId={use.id}
          discount={use.discount}
          version={query.data.expectedVersion}
        />
      ))}
    </section>
  );
}
function CancelCoupon({
  storeId,
  sessionId,
  useId,
  discount,
  version,
}: {
  storeId: string;
  sessionId: string;
  useId: string;
  discount: number;
  version: number;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [key] = useState(() => crypto.randomUUID());
  const cancel = useMutation({
    mutationFn: (reason: string) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].coupons.cancel.$post({
          param: { storeId, id: sessionId },
          json: { useId, reason, idempotencyKey: key, expectedVersion: version },
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, sessionId] }),
  });
  const form = useAppForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      await cancel.mutateAsync(value.reason).catch(() => undefined);
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p>−¥{discount}</p>
      <form.AppField name="reason">
        {(field) => <field.TextField label={t("coupon_reason")} required />}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton>{t("coupon_cancel")}</form.SubmitButton>
      </form.AppForm>
      <ActionFeedback
        pending={cancel.isPending}
        error={cancel.error}
        success={false}
        successMessage={t("account_saved")}
      />
    </form>
  );
}
