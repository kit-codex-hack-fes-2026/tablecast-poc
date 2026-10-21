import { describe, expect, it } from "vitest";
import { parseFlatSearch, stringifyFlatSearch } from "./router-search";
describe("OAuthの署名付きクエリ", () => {
  it("重複パラメーターと先頭ゼロを含むURLを再構築しても署名対象を変えない", () => {
    // Given: Better Authが発行する繰り返しキーを含むクエリ。
    const query =
      "?client_id=tablecast-test&exp=0001785726000&sig=test-signature&ba_param=client_id&ba_param=exp";
    // When / Then: Routerによる往復で元の値と重複キーを保つ。
    const parsed = parseFlatSearch(query);
    expect(parsed.ba_param).toEqual(["client_id", "exp"]);
    expect(stringifyFlatSearch(parsed)).toBe(query);
  });
  it("店舗ページで新しく指定した検索値は通常のURLクエリとして出力する", () => {
    expect(
      stringifyFlatSearch({ user_code: "001234", tableId: "tablecast-01", absent: undefined }),
    ).toBe("?user_code=001234&tableId=tablecast-01");
  });
});

it("Routerが一覧条件を合成しても署名のエンコードを保ち、条件の更新と削除を反映する", () => {
  const raw = "?scope=read%20write&sig=A%2fb%2Bz%3D&exp=0000123&ba_param=scope&ba_param=exp";
  const parsed = parseFlatSearch(raw);
  const withSearch = { ...parsed, consentStoresQ: "京都", consentStoresSort: "name:desc" };
  expect(stringifyFlatSearch(withSearch)).toBe(
    `${raw}&consentStoresQ=%E4%BA%AC%E9%83%BD&consentStoresSort=name%3Adesc`,
  );
  const restored = parseFlatSearch(stringifyFlatSearch(withSearch));
  expect(
    stringifyFlatSearch({ ...restored, consentStoresQ: undefined, consentStoresSort: undefined }),
  ).toBe(raw);
  expect(stringifyFlatSearch({ ...restored, consentStoresQ: "大阪" })).toBe(
    `${raw}&consentStoresSort=name%3Adesc&consentStoresQ=%E5%A4%A7%E9%98%AA`,
  );
});
