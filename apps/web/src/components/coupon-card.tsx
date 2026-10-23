import type { couponRuleSchema } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import type { z } from "zod";
import { useI18n } from "../i18n/locale";
import { DateTime } from "./date-time";
import { ProductImage } from "./product-image";
export function CouponCard({
  rules,
  children,
}: {
  children?: ReactNode;
  rules: z.infer<typeof couponRuleSchema>;
}) {
  const { t, locale } = useI18n();
  return (
    <article className="overflow-hidden rounded-2xl border border-warning/20 bg-warning-soft/30">
      <ProductImage
        src={`/media/${rules.imageKey}`}
        alt={rules.title[locale]}
        width={600}
        height={300}
        sizes="(max-width: 640px) 100vw, 480px"
        className="aspect-2/1 w-full object-cover"
      />
      <div className="space-y-3 border-t-2 border-dashed border-warning/30 p-5">
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
        {children}
      </div>
    </article>
  );
}
