import { expect, it } from "vitest";
import {
  localizedNames,
  resolveLocalized,
  resolveText,
  uiLocale,
} from "../src/modules/catalog/localization";
import { createMenuSearch } from "../src/modules/catalog/search";
import { configurationSchema, localeSchema, productSchema } from "../src/schema";
import { configuration, text } from "./configuration-fixture";

it.each([undefined, "", "   "])("意味訳と転写の片方が不足する翻訳を拒否する: %s", (missing) => {
  const product = configuration.products[0];
  if (!product) throw new Error("商品fixtureがありません。");
  const french = { displayName: "Thé vert grillé", transliteration: "Hōjicha" };
  expect(
    productSchema.safeParse({
      ...product,
      text: { ...product.text, fr: { ...french, displayName: missing } },
    }).success,
  ).toBe(false);
  expect(
    productSchema.safeParse({
      ...product,
      text: { ...product.text, fr: { ...french, transliteration: missing } },
    }).success,
  ).toBe(false);
  expect(
    productSchema.safeParse({ ...product, text: { ...product.text, fr: french } }).success,
  ).toBe(true);
});

it("未翻訳の商品名を組単位で英語、日本語の順に解決する", () => {
  const values = {
    ...text("ほうじ茶", "Roasted green tea"),
    fr: { ...text("", "").ja, displayName: "Thé vert grillé", transliteration: "Hōjicha" },
  };
  expect(resolveText(values, "fr").transliteration).toBe("Hōjicha");
  expect(resolveText(values, "ko").displayName).toBe("Roasted green tea");
  expect(resolveText({ ja: values.ja }, "ko").displayName).toBe("ほうじ茶");
  expect(Object.keys(values)).toEqual(["ja", "en", "fr"]);
  expect(resolveLocalized({ ja: "日本語", en: "English", ko: "  " }, "ko")).toBe("English");
});

it("任意の言語を登録し、UIのfallbackで会話の言語を書き換えない", () => {
  expect(localeSchema.parse("fr-CA")).toBe("fr-CA");
  expect(localeSchema.safeParse("fr_ca").success).toBe(false);
  expect(
    configurationSchema.parse({ ...configuration, languages: ["ja", "en", "fr-CA"] }).languages,
  ).toContain("fr-CA");
  expect(
    configurationSchema.safeParse({ ...configuration, languages: ["ja", "en", "en"] }).success,
  ).toBe(false);
  expect(uiLocale("fr-CA")).toBe("en");
  expect(uiLocale("zh-Hans")).toBe("zh-Hans");
});

it("転写と長音記号なしの照会でも同じ商品を検索でき、かなの濁点を保つ", () => {
  const product = configuration.products[0];
  if (!product) throw new Error("商品fixtureがありません。");
  const value = {
    ...configuration,
    products: [
      {
        ...product,
        text: {
          ja: {
            ...product.text.ja,
            displayName: "純米吟醸",
            transliteration: "じゅんまいぎんじょう",
          },
          en: {
            ...resolveText(product.text, "en"),
            displayName: "Pure rice sake",
            transliteration: "Junmai Ginjō",
          },
        },
      },
    ],
  };
  const search = createMenuSearch(value);
  expect(search("Ginjō").ids).toEqual([product.id]);
  expect(search("Ginjo").ids).toEqual([product.id]);
  expect(search("じゅんまいぎんじょう").ids).toEqual([product.id]);
  const snapshot = localizedNames(value.products[0]?.text ?? product.text);
  expect(snapshot.transliteration.en).toBe("Junmai Ginjō");
  expect(snapshot.name.en).toBe("Pure rice sake");
});
