import { createTokenizer as createJapaneseTokenizer } from "@zbsearch/tokenizers/japanese";
import { tokenizer as defaultTokenizer } from "zbsearch/components";

export type SearchLocale = "en" | "ja";
const normalizeSearchText = (value: string) => value.normalize("NFKC").toLowerCase();

/** 表示する原文を保ち、索引と検索語には同じ正規化・語形処理を適用する。 */
export function createSearchTokenizer(locale: SearchLocale) {
  const base =
    locale === "ja"
      ? createJapaneseTokenizer({ language: "japanese", stopWords: false })
      : defaultTokenizer.createTokenizer({ language: "english", stemming: true, stopWords: false });
  return {
    ...base,
    tokenize: (text: string, language?: string, property?: string) =>
      base.tokenize(normalizeSearchText(text), language, property),
  };
}
const analyzers = { ja: createSearchTokenizer("ja"), en: createSearchTokenizer("en") };
const segmenters = {
  ja: new Intl.Segmenter("ja", { granularity: "word" }),
  en: new Intl.Segmenter("en", { granularity: "word" }),
};

/** stemmingや全半角が異なる一致も、表示中の元の表記で強調する。 */
export function searchHighlightTerms(query: string, text: string, locale: SearchLocale) {
  const tokenizer = analyzers[locale];
  const tokens = tokenizer.tokenize(query);
  // 複合語の助詞・助動詞一文字だけで、無関係な場所まで強調しない。
  const terms = tokens.filter(
    (term) =>
      tokens.length === 1 ||
      locale !== "ja" ||
      !/^[\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(term),
  );
  if (!terms.length) return "";
  const literals = query
    .trim()
    .split(/\s+/)
    .filter((term) => text.toLowerCase().includes(term.toLowerCase()));
  return [
    ...new Set([
      ...literals,
      ...[...segmenters[locale].segment(text)]
        .filter(
          ({ segment, isWordLike }) =>
            isWordLike &&
            tokenizer.tokenize(segment).some((word) => terms.some((term) => word.startsWith(term))),
        )
        .map(({ segment }) => segment),
    ]),
  ]
    .toSorted((a, b) => b.length - a.length)
    .join(" ");
}
