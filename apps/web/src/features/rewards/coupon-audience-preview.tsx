import type { couponRuleSchema } from "@tablecast/api/schema";
import type { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";

export function CouponAudiencePreview({
  storeId,
  ruleId,
  rules,
  disabled,
}: {
  disabled: boolean;
  ruleId?: string;
  rules: z.infer<typeof couponRuleSchema>;
  storeId: string;
}) {
  const { t } = useI18n();
  const preview = useQuery({
    queryKey: ["tablecast-coupon-audience", storeId, ruleId, rules],
    enabled: false,
    retry: false,
    queryFn: () =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].coupons.audience.$post({
          param: { storeId },
          json: { ruleId, rules },
        }),
      ),
  });
  return (
    <section aria-label={t("coupon_audience")} className="col-span-full space-y-3">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || preview.isFetching}
        onClick={() => void preview.refetch()}
      >
        {t("coupon_audience")}
      </Button>
      {preview.data && (
        <div role="status" className="space-y-1 text-sm">
          <p>
            {t("coupon_audience_eligible")}: {preview.data.eligible} / {preview.data.totalMembers}
          </p>
          <p>
            {t("coupon_audience_issued")}: {preview.data.alreadyIssued} ·{" "}
            {t("coupon_audience_unmatched")}: {preview.data.notMatching}
          </p>
          <p className="text-muted-foreground">{t("coupon_audience_note")}</p>
        </div>
      )}
      <ErrorNotice query={preview} />
    </section>
  );
}
