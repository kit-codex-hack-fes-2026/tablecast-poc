import type { z } from "zod";
import type { couponRuleSchema } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { ProductImage } from "./product-image";
import { useI18n } from "../i18n/locale";
const dates = {
  ja: new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }),
};
export function CouponCard({
  rules,
  children,
}: {
  rules: z.infer<typeof couponRuleSchema>;
  children?: ReactNode;
}) {
  const { t, locale } = useI18n();
  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <ProductImage
        src={`/media/${rules.imageKey}`}
        alt={rules.title[locale]}
        width={600}
        height={300}
        sizes="(max-width: 640px) 100vw, 480px"
        className="aspect-2/1 w-full object-cover"
      />
      <div className="space-y-3 p-5">
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
          {dates[locale].format(rules.startsAt)} – {dates[locale].format(rules.endsAt)} (JST)
        </p>
        {children}
      </div>
    </article>
  );
}
