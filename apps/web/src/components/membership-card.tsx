import type { Configuration } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { calendarDate } from "../i18n/format";
import { useI18n } from "../i18n/locale";
import { ProductImage } from "./product-image";

export function MembershipCard({
  storeId,
  storeName,
  memberName,
  joinedAt,
  branding,
  imageBasePath,
  balance,
  visitCount,
  children,
}: {
  balance?: number;
  branding?: Configuration["branding"];
  children?: ReactNode;
  imageBasePath?: string;
  joinedAt: number;
  memberName?: null | string;
  storeId: string;
  storeName: string;
  visitCount?: number;
}) {
  const { t, locale } = useI18n();
  const card = branding?.membershipCard;
  const palette = {
    neutral: { backgroundColor: "var(--gray-2)", color: "var(--gray-12)" },
    green: { backgroundColor: "var(--green-2)", color: "var(--green-12)" },
    amber: { backgroundColor: "var(--amber-2)", color: "var(--amber-12)" },
    violet: { backgroundColor: "var(--violet-2)", color: "var(--violet-12)" },
  };
  const images = imageBasePath ?? `/api/member-stores/${encodeURIComponent(storeId)}`;
  return (
    <section
      aria-label={t("customer_card")}
      className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm"
      style={palette[card?.tone ?? "neutral"]}
    >
      <div className="space-y-3 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          {branding?.logo && (
            <ProductImage
              src={`${images}/images/${branding.logo.imageKey}`}
              alt={branding.logo.alt[locale]}
              width={52}
              height={52}
              sizes="52px"
              priority
              className="size-13 shrink-0 rounded-xl bg-card p-1 object-contain"
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs opacity-75">{t("customer_card")}</p>
            <h1 className="text-xl font-semibold leading-tight tracking-tight wrap-anywhere sm:text-2xl">
              {storeName}
            </h1>
          </div>
        </div>
        {card?.image && (
          <ProductImage
            src={`${images}/images/${card.image.imageKey}`}
            alt={card.image.alt[locale]}
            width={800}
            height={320}
            sizes="(max-width: 640px) 100vw, 608px"
            className={
              card.imageFit === "contain"
                ? "aspect-5/2 h-auto w-full object-contain"
                : "aspect-5/2 h-auto w-full object-cover"
            }
          />
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            {memberName && <p className="font-medium wrap-anywhere">{memberName}</p>}
            <p className="text-xs opacity-75">
              {t("customer_since")} {calendarDate(joinedAt, locale)}
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
            {t("customer_membership_active")}
          </span>
        </div>
        {(balance !== undefined || visitCount !== undefined) && (
          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4">
            {balance !== undefined && (
              <div className="space-y-1">
                <dt className="text-xs opacity-75">{t("customer_points_balance")}</dt>
                <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                  {balance.toLocaleString(locale)} <span className="text-sm font-medium">pt</span>
                </dd>
              </div>
            )}
            {visitCount !== undefined && (
              <div className="space-y-1">
                <dt className="text-xs opacity-75">{t("customer_points_visits")}</dt>
                <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                  {visitCount.toLocaleString(locale)}
                </dd>
              </div>
            )}
          </dl>
        )}
        {children}
      </div>
    </section>
  );
}
