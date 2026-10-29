import type { Product } from "@tablecast/api/schema";
import { legacyFoodInformation } from "@tablecast/api/schema";

export function bilingual(
  ja: string,
  en: string,
  descriptionJa = "",
  descriptionEn = "",
): Product["text"] {
  return {
    ja: { displayName: ja, speechName: ja, description: descriptionJa, aliases: [] },
    en: { displayName: en, speechName: en, description: descriptionEn, aliases: [] },
  };
}

export function allergenRecord(
  contains: null | string[],
  ingredients: readonly [string, string],
): Product["foodInfo"] {
  return legacyFoodInformation({
    contains: contains ?? [],
    evidence: contains === null ? "unknown" : "verified",
    crossContact: "unknown",
    vegan: "unknown",
    note: {
      ja: `原材料・調理情報：${ingredients[0]}。`,
      en: `Ingredients and preparation: ${ingredients[1]}.`,
    },
  });
}
