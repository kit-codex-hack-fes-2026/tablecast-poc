import { createSearchAPI } from "fumadocs-core/search/server";
import { helpSource } from "./help-source";
import { createSearchTokenizer, type SearchLocale } from "./search-analysis";

function createHelpSearch(locale: SearchLocale) {
  return createSearchAPI("advanced", {
    indexes: helpSource.getPages(locale).map((page) => ({
      id: page.url,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      structuredData: page.data.structuredData,
    })),
    tokenizer: createSearchTokenizer(locale),
    search: { threshold: 0 },
  });
}

const searches: Partial<Record<SearchLocale, ReturnType<typeof createHelpSearch>>> = {};

export async function searchHelp(query: string, locale: SearchLocale) {
  // 索引作成はタイマーを使うためリクエスト内で開始し、完了した公開索引だけ再利用する。
  const server = searches[locale] ?? createHelpSearch(locale);
  const results = await server.search(query, { limit: 16 });
  searches[locale] = server;
  return results;
}
