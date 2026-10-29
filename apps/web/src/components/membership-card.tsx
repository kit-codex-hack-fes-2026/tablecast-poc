import type { Configuration } from "@tablecast/api/schema";
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
}: {
  branding?: Configuration["branding"];
  imageBasePath?: string;
  joinedAt: number;
  memberName?: null | string;
  storeId: string;
  storeName: string;
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
      className="overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-sm"
      style={card && palette[card.tone]}
    >
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
      <div className="flex min-h-52 flex-col justify-between gap-8 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0 space-y-2">
            <p className="text-sm opacity-85">{t("customer_card")}</p>
            <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere sm:text-3xl">
              {storeName}
            </h1>
          </div>
          {branding?.logo && (
            <ProductImage
              src={`${images}/images/${branding.logo.imageKey}`}
              alt={branding.logo.alt[locale]}
              width={56}
              height={56}
              sizes="56px"
              className="size-14 shrink-0 rounded-xl bg-card p-1 object-contain"
            />
          )}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            {memberName && <p className="text-lg font-medium wrap-anywhere">{memberName}</p>}
            <p className="text-sm opacity-85">
              {t("customer_since")} {calendarDate(joinedAt, locale)}
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
            {t("customer_membership_active")}
          </span>
        </div>
      </div>
    </section>
  );
}
