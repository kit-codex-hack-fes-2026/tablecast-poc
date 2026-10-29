import type { JapaneseAllergen, Product } from "@tablecast/api/schema";
import { unknownFoodProfile } from "@tablecast/api/schema";

export function bilingual(
  ja: string,
  en: string,
  descriptionJa = "",
  descriptionEn = "",
): { en: Product["text"]["ja"]; ja: Product["text"]["ja"] } {
  return {
    ja: {
      displayName: ja,
      transliteration: ja,
      speechName: ja,
      description: descriptionJa,
      aliases: [],
    },
    en: {
      displayName: en,
      transliteration: en,
      speechName: en,
      description: descriptionEn,
      aliases: [],
    },
  };
}

export function allergenRecord(contains: JapaneseAllergen[] | null): Product["foodInfo"] {
  const base = unknownFoodProfile();
  for (const id of contains ?? []) base.allergens[id] = "contains";
  return { base, components: [], defaultComponentIds: [] };
}
