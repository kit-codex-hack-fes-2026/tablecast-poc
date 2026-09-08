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
