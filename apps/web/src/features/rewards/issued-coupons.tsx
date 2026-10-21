import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { issuedCouponsOptions } from "./coupon-query";

export function IssuedCoupons({ storeId, canEdit }: { canEdit: boolean; storeId: string }) {
  const { t, locale } = useI18n();
  const query = useInfiniteQuery(issuedCouponsOptions(storeId));
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("coupon_issued")}</h2>
      {query.data?.pages.some((page) => page.coupons.length > 0) && (
        <p className="text-sm text-muted-foreground">{t("coupon_revoke_note")}</p>
      )}
      {query.isSuccess && query.data.pages.every((page) => page.coupons.length === 0) && (
        <p className="rounded-xl border border-border bg-muted/50 p-5 text-muted-foreground">
          {t("common_empty")}
        </p>
      )}
      <ErrorNotice
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
      {query.data?.pages.flatMap((page) =>
        page.coupons.map((coupon) => (
          <article key={coupon.id} className="space-y-3 rounded-xl border p-4">
            <h3>{coupon.rules.title[locale]}</h3>
            <UserIdentity compact user={coupon} />
            <Badge
              variant={
                coupon.state === "available"
                  ? "success"
                  : coupon.state === "requested"
                    ? "warning"
                    : "inactive"
              }
            >
              {t(`coupon_${coupon.state}`)}
            </Badge>
            {canEdit && (coupon.state === "available" || coupon.state === "requested") && (
              <RevokeCoupon storeId={storeId} couponId={coupon.id} />
            )}
          </article>
        )),
      )}
      {query.hasNextPage && (
        <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t("customer_more")}
        </Button>
      )}
    </section>
  );
}

function RevokeCoupon({ storeId, couponId }: { couponId: string; storeId: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const revoke = useMutation({
    mutationFn: (reason: string) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].coupons[":couponId"].revoke.$post({
          param: { storeId, couponId },
          json: { reason },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-coupon-issued", storeId] }),
  });
  const form = useAppForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      await revoke.mutateAsync(value.reason).catch(() => undefined);
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
      <form.AppField name="reason">
        {(field) => <field.TextField label={t("coupon_reason")} required />}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton>{t("coupon_revoke")}</form.SubmitButton>
      </form.AppForm>
      <ActionFeedback
        pending={revoke.isPending}
        error={revoke.error}
        success={false}
        successMessage={t("account_saved")}
      />
    </form>
  );
}
