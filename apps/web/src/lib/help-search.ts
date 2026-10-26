import { type AdvancedIndex, createSearchAPI } from "fumadocs-core/search/server";
import { helpSource } from "./help-source";
import { createSearchTokenizer, type SearchLocale } from "./search-analysis";

function createHelpSearch(indexes: AdvancedIndex[], locale: SearchLocale) {
  return createSearchAPI("advanced", {
    indexes,
    tokenizer: createSearchTokenizer(locale),
    search: { threshold: 0 },
  });
}
function forLocale(locale: SearchLocale) {
  return createHelpSearch(
    helpSource.getPages(locale).map((page) => ({
      id: page.url,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      structuredData: page.data.structuredData,
    })),
    locale,
  );
}
export const helpSearch = { ja: forLocale("ja"), en: forLocale("en") };
