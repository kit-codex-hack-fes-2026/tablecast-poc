import { createTablecastClient, parseResponse } from "@tablecast/api/client";
import { expect, it } from "vitest";
import { activeServerFieldErrors, serverFieldErrors } from "./server-field-errors";

async function responseError(code: string, details: unknown) {
  const client = createTablecastClient("https://tablecast.test", {
    fetch: async () => Response.json({ error: { code, details } }, { status: 422 }),
  });
  return parseResponse(client.api.admin.stores.$get()).catch((error: unknown) => error);
}

const issues = [
  {
    path: ["products", 0, "name"],
    code: "too_big",
    messages: { ja: "商品名は3文字以下です。", en: "Use at most 3 characters for the name." },
  },
  {
    path: ["products", 0, "name"],
    code: "custom",
    messages: { ja: "公開できる名前が必要です。", en: "Use a name suitable for publication." },
  },
  {
    path: ["slug"],
    code: "invalid_format",
    messages: { ja: "半角英小文字を使ってください。", en: "Use lower-case letters." },
  },
];
const fieldNames = { "products.0.name": "productName" };

it("API項目エラーは配列のpathと項目名の対応を保ち、日英日で翻訳する", async () => {
  const error = await responseError("INVALID_INPUT", issues);
  const japanese = serverFieldErrors(error, "ja", fieldNames);
  expect(japanese).toEqual({
    productName: ["商品名は3文字以下です。", "公開できる名前が必要です。"],
    slug: ["半角英小文字を使ってください。"],
  });
  expect(serverFieldErrors(error, "en", fieldNames)).toEqual({
    productName: ["Use at most 3 characters for the name.", "Use a name suitable for publication."],
    slug: ["Use lower-case letters."],
  });
  expect(serverFieldErrors(error, "ja", fieldNames)).toEqual(japanese);
});

it("修正済みの項目エラーは言語を切り替えても戻さず、新しい失敗時だけ再付与する", async () => {
  const error = await responseError("INVALID_INPUT", issues);
  const metadata = {
    productName: { errorMap: {} },
    slug: { errorMap: { onServer: ["半角英小文字を使ってください。"] } },
  };
  for (const locale of ["ja", "en", "ja"] as const) {
    const fields = serverFieldErrors(error, locale, fieldNames);
    expect(activeServerFieldErrors(fields, metadata, true)).toEqual({ slug: fields.slug });
    expect(activeServerFieldErrors(fields, metadata, false)).toEqual(fields);
  }
});

it("項目エラー以外や不正なdetailsをフォームの項目へ割り当てない", async () => {
  for (const error of [
    await responseError("CONFLICT", issues),
    await responseError("INVALID_INPUT", [{ path: ["name"], messages: { ja: "日本語のみ" } }]),
    new Error("network"),
    undefined,
  ]) {
    expect(serverFieldErrors(error, "ja", fieldNames)).toEqual({});
    expect(serverFieldErrors(error, "en", fieldNames)).toEqual({});
  }
});
