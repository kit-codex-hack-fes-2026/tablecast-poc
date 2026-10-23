import { expect, it } from "vitest";
import { loginReturnUrl } from "./login-model";

const origin = "https://tablecast.example.test";
const returnSearch = (path: string) => `?${new URLSearchParams({ returnTo: path })}`;

it.each([
  { path: "/", expected: "https://tablecast.example.test/" },
  {
    path: "/member/tablecast-komorebi?sessionId=visit-1#orders",
    expected: "https://tablecast.example.test/member/tablecast-komorebi?sessionId=visit-1#orders",
  },
  {
    path: "/admin/stores/tablecast-komorebi/menu/changes/draft-1/products?q=tea%20latte&page=2#price",
    expected:
      "https://tablecast.example.test/admin/stores/tablecast-komorebi/menu/changes/draft-1/products?q=tea%20latte&page=2#price",
  },
  {
    path: "/admin/../member?tag=first&tag=second&query=a+b%2Bc#visits",
    expected: "https://tablecast.example.test/member?tag=first&tag=second&query=a+b%2Bc#visits",
  },
])("$path: 内部の戻り先のpath・query・hashを保つ", ({ path, expected }) => {
  expect(loginReturnUrl(returnSearch(path), origin)).toBe(expected);
});

it.each([
  "",
  "member",
  "https://external.example.test/path",
  "//external.example.test/path",
  "/\\external.example.test/path",
  "/\t\\external.example.test/path",
  "/\r/external.example.test/path",
  "\n//external.example.test/path",
  "/\\[invalid",
])("未指定・不正な戻り先%sを採用しない", (path) => {
  expect(loginReturnUrl(returnSearch(path), origin)).toBeUndefined();
});

it("戻り先がない場合は指定店舗と下書きを保持する", () => {
  expect(loginReturnUrl("?returnStoreId=store-1&returnDraftId=draft-1", origin)).toBe(
    "/admin/live?storeId=store-1&draftId=draft-1",
  );
});

it("正規化で先頭が//になるpathも遷移時に同一originを維持する", () => {
  expect(loginReturnUrl(returnSearch("/admin/..//external.example.test/path"), origin)).toBe(
    "https://tablecast.example.test//external.example.test/path",
  );
});

it("署名付き同意は戻り先より優先し、繰返しqueryとエンコードをそのまま保つ", () => {
  const search =
    "?sig=signed%2Bvalue&ba_param=first&ba_param=second&state=a+b%2Bc&returnTo=%2F%5Cexternal.example.test";
  expect(loginReturnUrl(search, origin)).toBe(`/consent${search}`);
});
