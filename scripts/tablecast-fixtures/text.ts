import type { Product } from "@tablecast/api/schema";

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
