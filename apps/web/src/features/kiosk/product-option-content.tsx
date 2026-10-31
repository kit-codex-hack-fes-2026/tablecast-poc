import type { Product } from "@tablecast/api/schema";
import { resolveText } from "@tablecast/api/localization";
import type { ProductOptionAllergens } from "./product-food-query";
import { AllergenBadges } from "../../components/allergen-badges";
import { MenuOptionImage } from "../../components/menu-option-image";
import { Skeleton } from "../../components/ui/skeleton";
import { useI18n } from "../../i18n/locale";

export function OptionContent({
  option,
  locale,
  id,
  allergens,
  allergensPending = false,
  showAllergens = false,
}: {
  allergens?: ProductOptionAllergens;
  allergensPending?: boolean;
  id: string;
  locale: string;
  option: Product["modifiers"][number]["options"][number];
  showAllergens?: boolean;
}) {
  const { t } = useI18n();
  const hasAllergens = Boolean(
    allergens && (allergens.contains.length > 0 || allergens.unverified),
  );
  const reserveAllergens = showAllergens && option.foodChanges?.add.length !== 0;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <MenuOptionImage
        showIllustration={false}
        compact
        imageKey={option.imageKey}
        imageKind={option.imageKind}
      />
      <div
        className={reserveAllergens ? "flex min-h-13 min-w-0 flex-col justify-center" : "min-w-0"}
      >
        <span id={`${id}-name`} className="block font-medium wrap-break-word">
          {resolveText(option.text, locale).displayName}
        </span>
        {showAllergens && (
          <div
            id={`${id}-allergens`}
            className={
              hasAllergens || (allergensPending && reserveAllergens) ? "mt-0.5" : undefined
            }
          >
            {allergensPending && reserveAllergens && <Skeleton className="h-6 w-20 rounded-full" />}
            {allergens && (allergens.contains.length > 0 || allergens.unverified) && (
              <AllergenBadges
                contains={allergens.contains}
                unverified={allergens.unverified}
                label={t("food_option_allergens")}
              />
            )}
          </div>
        )}
        {resolveText(option.text, locale).description && (
          <span
            id={`${id}-description`}
            className="mt-1 block text-sm leading-relaxed text-muted-foreground wrap-break-word"
          >
            {resolveText(option.text, locale).description}
          </span>
        )}
      </div>
    </div>
  );
}
