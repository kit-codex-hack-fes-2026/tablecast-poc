import type { ComponentProps } from "react";
import { cn } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { AllergenBadges } from "./allergen-badges";
import { MenuOptionImage } from "./menu-option-image";
import { Money, PriceChange } from "./money";
import { Skeleton } from "./ui/skeleton";

/** 選択・確定注文・設定一覧で共用する選択肢の表示。入力と業務判断は呼出し元が所有する。 */
export function CustomisationContent({
  name,
  description,
  imageKey = null,
  imageKind = "illustration",
  id,
  group,
  quantity,
  compact = true,
  showIllustration = true,
  reserveImageSpace = false,
  allergens,
  allergensPending = false,
  reserveAllergens = false,
  showAllergens = false,
  className,
}: {
  allergens?: Pick<ComponentProps<typeof AllergenBadges>, "contains" | "unverified">;
  allergensPending?: boolean;
  className?: string;
  compact?: boolean;
  description?: string;
  group?: string;
  id?: string;
  imageKey?: null | string;
  imageKind?: "illustration" | "photograph";
  name: string;
  quantity?: number;
  reserveAllergens?: boolean;
  reserveImageSpace?: boolean;
  showAllergens?: boolean;
  showIllustration?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-2", className)}>
      {group && <span className="font-medium">{group}: </span>}
      <MenuOptionImage
        imageKey={imageKey}
        imageKind={imageKind}
        compact={compact}
        showIllustration={showIllustration}
        reserveImageSpace={reserveImageSpace}
      />
      <div
        className={
          showAllergens && reserveAllergens
            ? "flex min-h-13 min-w-0 flex-col justify-center"
            : "min-w-0"
        }
      >
        <span id={id ? `${id}-name` : undefined} className="block font-medium wrap-anywhere">
          {name}
          {quantity !== undefined && quantity > 1 && ` × ${quantity}`}
        </span>
        {showAllergens && (
          <CustomisationAllergens
            id={id}
            allergens={allergens}
            pending={allergensPending}
            reserve={reserveAllergens}
          />
        )}
        {description && (
          <span
            id={id ? `${id}-description` : undefined}
            className="mt-1 block text-sm leading-relaxed text-muted-foreground wrap-anywhere"
          >
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

function CustomisationAllergens({
  id,
  allergens,
  pending,
  reserve,
}: {
  allergens: Pick<ComponentProps<typeof AllergenBadges>, "contains" | "unverified"> | undefined;
  id?: string;
  pending: boolean;
  reserve: boolean;
}) {
  const { t } = useI18n();
  const hasAllergens = Boolean(
    allergens && (allergens.contains.length > 0 || allergens.unverified),
  );
  return (
    <div
      id={id ? `${id}-allergens` : undefined}
      className={hasAllergens || (pending && reserve) ? "mt-0.5" : undefined}
    >
      {pending && reserve && <Skeleton className="h-6 w-20 rounded-full" />}
      {allergens && hasAllergens && (
        <AllergenBadges {...allergens} label={t("food_option_allergens")} />
      )}
    </div>
  );
}

/** 同じ追加料金と売切表示を、選択操作の位置を変えずに共有する。 */
export function CustomisationPrice({
  value,
  available = true,
  showZero = false,
  id,
  className,
}: {
  available?: boolean;
  className?: string;
  id?: string;
  showZero?: boolean;
  value: number;
}) {
  const { t } = useI18n();
  return (
    <small
      id={id}
      className={cn("shrink-0 text-sm whitespace-nowrap text-muted-foreground", className)}
    >
      {!available ? (
        t("kiosk_sold_out")
      ) : value !== 0 ? (
        <PriceChange value={value} />
      ) : showZero ? (
        <Money value={0} />
      ) : null}
    </small>
  );
}
