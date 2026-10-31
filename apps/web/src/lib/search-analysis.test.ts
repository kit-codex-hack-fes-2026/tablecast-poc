import { createSearchAPI } from "fumadocs-core/search/server";
import { expect, it } from "vitest";
import { createSearchTokenizer, searchHighlightTerms } from "./search-analysis";

it("日本語の空白なし・全半角・英字大小文字とAPI名を同じ索引で検索する", async () => {
  const server = createSearchAPI("advanced", {
    tokenizer: createSearchTokenizer("ja"),
    search: { threshold: 0 },
    indexes: [
      {
        id: "tablecast-search-ja",
        url: "/help/ja/configuration",
        title: "設定と公開",
        structuredData: {
          headings: [],
          contents: [
            {
              heading: undefined,
              content: "商品の価格を変更し、MCPでget_configurationとexpectedVersionを確認する。",
            },
          ],
        },
      },
    ],
  });
  for (const query of [
    "商品価格",
    "価格変更",
    "ＭＣＰ",
    "mcp",
    "get_configuration",
    "EXPECTEDVERSION",
  ]) {
    const results = await server.search(query);
    expect(results.some((item) => item.url === "/help/ja/configuration")).toBe(true);
  }
});
it("英語の単複・活用を検索し、原文の表記を保持する", async () => {
  const content = "A customer connects to a store and edits its published menu.";
  const server = createSearchAPI("advanced", {
    tokenizer: createSearchTokenizer("en"),
    search: { threshold: 0 },
    indexes: [
      {
        id: "tablecast-search-en",
        url: "/help/en/mcp",
        title: "Connections",
        structuredData: { headings: [], contents: [{ heading: undefined, content }] },
      },
    ],
  });
  for (const query of ["customers", "connecting", "connected", "STORES", "publishing"]) {
    const results = await server.search(query);
    expect(results.some((item) => item.content === content)).toBe(true);
  }
  expect(await server.search("存在しない検索語")).toEqual([]);
});
it("語形変化と全半角の一致箇所を表示中の表記で返す", () => {
  expect(searchHighlightTerms("困ったとき", "表示されたエラー", "ja")).toBe("");
  expect(searchHighlightTerms("customers", "A customer connects", "en")).toBe("customer");
  expect(searchHighlightTerms("ＭＣＰ", "MCPで設定する", "ja")).toBe("MCP");
  expect(searchHighlightTerms("商品価格", "商品の価格を変更する", "ja")).toBe("商品 価格");
});
