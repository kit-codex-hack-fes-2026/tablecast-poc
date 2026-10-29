import type { Product } from "@tablecast/api/schema";
import { resolveLocalized } from "@tablecast/api/localization";
import { useI18n } from "../../i18n/locale";

const allergenLabels: Partial<Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]>> = {
  crustaceans: "kiosk_allergen_crustaceans",
  molluscs: "kiosk_allergen_molluscs",
  buckwheat: "kiosk_allergen_buckwheat",
  peanuts: "kiosk_allergen_peanuts",
  mustard: "kiosk_allergen_mustard",
  fish: "kiosk_allergen_fish",
  wheat: "kiosk_allergen_wheat",
  soya: "kiosk_allergen_soya",
  egg: "kiosk_allergen_egg",
  sesame: "kiosk_allergen_sesame",
  prawn: "kiosk_allergen_prawn",
  barley: "kiosk_allergen_barley",
  milk: "kiosk_allergen_milk",
};

export function ProductAllergens({ product }: { product: Product }) {
  const { locale, t } = useI18n();
  return (
    <div className="bg-surface-subtle rounded-2xl p-4 mt-6">
      <h3 className="text-xs mb-2">{t("kiosk_allergens")}</h3>
      <p className="mb-2 text-sm font-semibold">
        {product.allergens.contains
          .map((item) => {
            const key = allergenLabels[item];
            return key ? t(key) : item;
          })
          .join(t("kiosk_allergen_separator")) ||
          (product.allergens.evidence === "verified"
            ? t("kiosk_allergens_none")
            : t("kiosk_unknown"))}
      </p>
      <p className="block text-xs leading-relaxed text-muted-foreground">
        {resolveLocalized(product.allergens.note, locale) || t("kiosk_unknown")}
      </p>
      {product.allergens.vegan === "yes" && (
        <p className="block text-xs leading-relaxed text-muted-foreground">{t("kiosk_vegan")}</p>
      )}
      {product.allergens.crossContact !== "controlled" &&
        !resolveLocalized(product.allergens.note, locale) && (
          <p className="block text-xs leading-relaxed text-muted-foreground">
            {t("kiosk_cross_contact")}
          </p>
        )}
    </div>
  );
}
