import type { couponRuleSchema } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import type { z } from "zod";
import { tv } from "tailwind-variants";
import { dateTime } from "../i18n/format";
import { useI18n } from "../i18n/locale";
import { DateTime } from "./date-time";
import { ProductImage } from "./product-image";
const couponImage = tv({
  base: "h-auto w-full bg-card",
  variants: {
    layout: { landscape: "aspect-2/1", portrait: "aspect-3/4" },
    imageFit: { cover: "object-cover", contain: "object-contain" },
  },
  defaultVariants: { layout: "landscape", imageFit: "cover" },
});
/** 発行時の券面・割引・利用条件を表示する。管理画面のプレビューでは認可済み画像配信先を渡す。 */
export function CouponCard({
  rules,
  storeId,
  children,
  imageBasePath,
}: {
  children?: ReactNode;
  imageBasePath?: string;
  rules: z.infer<typeof couponRuleSchema>;
  storeId: string;
}) {
  const { t, locale } = useI18n();
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <ProductImage
        src={`${imageBasePath ?? `/api/customer/stores/${storeId}/coupons`}/images/${rules.imageKey}`}
        alt={rules.title[locale]}
        width={600}
        height={rules.presentation?.layout === "portrait" ? 800 : 300}
        sizes="(max-width: 640px) 100vw, 480px"
        className={couponImage(rules.presentation)}
      />
      <div className="space-y-3 border-t-2 border-dashed border-border p-5">
        <h3 className="text-xl font-semibold">{rules.title[locale]}</h3>
        <p>{rules.description[locale]}</p>
        <p className="text-3xl font-semibold">
          {rules.discountKind === "fixed" ? `¥${rules.discountValue}` : `${rules.discountValue}%`}
        </p>
        {rules.discountKind === "percent" && (
          <p>
            {t("coupon_cap")}: ¥{rules.maximumYen}
          </p>
        )}
        <p>
          {t("coupon_minimum")}: ¥{rules.minimumYen}
        </p>
        <p className="text-sm text-muted-foreground">
          <DateTime value={rules.startsAt} /> {locale === "ja" ? "から" : "to"}{" "}
          <DateTime value={rules.endsAt} />
        </p>
        {rules.conditions &&
          (rules.conditions.all.length > 0 || rules.conditions.any.length > 0) && (
            <section className="space-y-2 text-sm" aria-label={t("coupon_acquisition_conditions")}>
              <h4 className="font-medium">{t("coupon_acquisition_conditions")}</h4>
              {(["all", "any"] as const).map((group) =>
                rules.conditions?.[group].length ? (
                  <p key={group}>
                    {t(`coupon_acquisition_${group}`)}:{" "}
                    {rules.conditions[group]
                      .map((condition) => {
                        const dated =
                          condition.field === "joinedAt" || condition.field === "lastVisitAt";
                        const value = dated
                          ? dateTime(condition.value, locale)
                          : condition.value.toLocaleString(locale);
                        const comparison = t(
                          condition.operator === "gte"
                            ? dated
                              ? "coupon_acquisition_after"
                              : "coupon_acquisition_gte"
                            : dated
                              ? "coupon_acquisition_before"
                              : "coupon_acquisition_lte",
                        );
                        return locale === "ja"
                          ? `${t(`coupon_condition_${condition.field}`)} ${value}${comparison}`
                          : `${t(`coupon_condition_${condition.field}`)} ${comparison} ${value}`;
                      })
                      .join(locale === "ja" ? "、" : "; ")}
                  </p>
                ) : null,
              )}
            </section>
          )}
        {children}
      </div>
    </article>
  );
}
