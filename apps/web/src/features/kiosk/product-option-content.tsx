import type { Product } from "@tablecast/api/schema";
import type { ProductOptionAllergens } from "./product-food-query";
import { AllergenBadges } from "../../components/allergen-badges";
import { MenuOptionImage } from "../../components/menu-option-image";
import { useI18n } from "../../i18n/locale";

export function OptionContent({
  option,
  locale,
  id,
  allergens,
  showAllergens = false,
}: {
  allergens?: ProductOptionAllergens;
  id: string;
  locale: "en" | "ja";
  option: Product["modifiers"][number]["options"][number];
  showAllergens?: boolean;
}) {
  const { t } = useI18n();
  const hasAllergens = Boolean(
    allergens && (allergens.contains.length > 0 || allergens.unverified),
  );
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <MenuOptionImage
        showIllustration={false}
        compact
        imageKey={option.imageKey}
        imageKind={option.imageKind}
      />
      <div className="min-w-0">
        <span id={`${id}-name`} className="block font-medium wrap-break-word">
          {option.text[locale].displayName}
        </span>
        {showAllergens && (
          <div id={`${id}-allergens`} className={hasAllergens ? "mt-0.5" : undefined}>
            {allergens && (allergens.contains.length > 0 || allergens.unverified) && (
              <AllergenBadges
                contains={allergens.contains}
                unverified={allergens.unverified}
                label={t("food_option_allergens")}
              />
            )}
          </div>
        )}
        {option.text[locale].description && (
          <span
            id={`${id}-description`}
            className="mt-1 block text-sm leading-relaxed text-muted-foreground wrap-break-word"
          >
            {option.text[locale].description}
          </span>
        )}
      </div>
    </div>
  );
}
