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
      ja: `合成デモの登録原材料・調理情報：${ingredients[0]}。未登録の選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。`,
      en: `Recorded ingredients and preparation for this fictional demo: ${ingredients[1]}. Unrecorded ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies.`,
    },
  });
}
