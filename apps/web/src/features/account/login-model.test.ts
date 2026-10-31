import { expect, it } from "vitest";
import { loginReturnUrl, memberStoreLoginId, memberVisitLoginCode } from "./login-model";

const origin = "https://tablecast.example.test";
const returnSearch = (path: string) => `?${new URLSearchParams({ returnTo: path })}`;

it("店舗PWAの会員証と子画面から戻る時だけ店舗識別を引き継ぐ", () => {
  expect(memberStoreLoginId("/member/tablecast-komorebi")).toBe("tablecast-komorebi");
  expect(memberStoreLoginId("/member/tablecast-komorebi/coupons?sessionId=visit")).toBe(
    "tablecast-komorebi",
  );
  for (const path of [
    "/member",
    "/member/join?code=abc",
    "/member/tablecast%2Fother",
    "/member/%",
    "//external.example.test/member/tablecast-komorebi",
    "/admin/tablecast-komorebi",
  ])
    expect(memberStoreLoginId(path)).toBeUndefined();
});
const visitCode = "a".repeat(64);

it.each([`/member/join?code=${visitCode}`, `/member/join?lang=en&code=${visitCode}#visit`])(
  "正しいQR参加先%sだけからログイン用の店舗照会コードを取得する",
  (returnTo) => {
    expect(memberVisitLoginCode(returnTo)).toBe(visitCode);
  },
);

it.each([
  undefined,
  [`/member/join?code=${visitCode}`],
  `https://external.example.test/member/join?code=${visitCode}`,
  `//external.example.test/member/join?code=${visitCode}`,
  `/member/tablecast-store?code=${visitCode}`,
  "/member/join?code=short",
  `/member/join?code=${visitCode.toUpperCase()}`,
  "/member/join?lang=en",
])("対象外または不正な戻り先%jではログイン用の店舗照会コードを返さない", (returnTo) => {
  expect(memberVisitLoginCode(returnTo)).toBeUndefined();
});

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
