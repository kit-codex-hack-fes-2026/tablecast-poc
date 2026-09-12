import { env } from "cloudflare:workers";
import { expect, expectTypeOf, it } from "vitest";
import type { InferResponseType } from "hono/client";
import app from "../src/app";
import {
  createTablecastClient,
  createTableSessionClient,
  DetailedError,
  parseResponse,
} from "../src/client";
import { apiErrorSchema, validationIssuesSchema } from "../src/schema";
import { setupFixture } from "./fixture";

const client = createTablecastClient("http://localhost:3000", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    app.request(new Request(input, init), undefined, env),
});

it("未認証のRPCを呼ぶと、hcの失敗型と実応答が一致しrequest IDを返す", async () => {
  // Given: Cookieを持たない公開client。
  type Failure = InferResponseType<typeof client.api.admin.stores.$get, 401>;
  expectTypeOf<Failure>().toEqualTypeOf<{
    error: { code: string; message?: string; details?: unknown };
    traceId?: string;
  }>();
  // When: 店舗一覧の認証が失敗する。
  const response = await client.api.admin.stores.$get();
  // Then: 全体middlewareからのエラーも同じ契約になる。
  expect(response.status).toBe(401);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.traceId).toBe(response.headers.get("X-Request-Id"));
  expect(body.error.code).toBe("LOGIN_REQUIRED");
});

it.each([
  { name: "JSONの構文不正", body: "{", type: "application/json", status: 400 },
  { name: "JSONの項目不足", body: "{}", type: "application/json", status: 422 },
  { name: "フォームの画像不足", body: "", type: "application/x-www-form-urlencoded", status: 422 },
])("$nameを送ると、入力本文を漏らさず共通エラーにする", async ({ name, body, type, status }) => {
  // Given: 実appのJSONまたはform validator。
  const path = name === "フォームの画像不足" ? "/api/account/avatar" : "/api/admin/stores";
  // When: 入力検証で拒否される。
  const response = await app.request(
    path,
    { method: "POST", headers: { "Content-Type": type }, body },
    env,
  );
  // Then: HTTPException・Zodの形式差をWebへ漏らさない。
  expect(response.status).toBe(status);
  expect(apiErrorSchema.parse(await response.json())).toMatchObject({
    error: { code: "INVALID_INPUT" },
    traceId: response.headers.get("X-Request-Id"),
  });
});

it("認証済み店舗一覧の成功型と標準parseResponseの結果を維持する", async () => {
  // Given: 実D1とBetter Authの店舗メンバー。
  const { cookie } = await setupFixture();
  const authenticated = createTablecastClient("http://localhost:3000", {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Cookie", cookie);
      return app.request(new Request(input, { ...init, headers }), undefined, env);
    },
  });
  // When: 共通エラー型付きclientで成功応答を解析する。
  const stores = await parseResponse(authenticated.api.admin.stores.$get());
  // Then: 成功データへエラー型が混ざらず、実店舗を返す。
  expectTypeOf(stores.stores).toBeArray();
  expect(stores.stores).toContainEqual(expect.objectContaining({ id: "tablecast-store" }));
});

it("卓clientの認証失敗も標準DetailedErrorとして返す", async () => {
  // Given: 未接続の卓client。
  const table = createTableSessionClient("http://localhost:3000/api/table", {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      app.request(new Request(input, init), undefined, env),
  });
  // When / Then: 401の型を公開し、実応答も標準例外にする。
  expectTypeOf<InferResponseType<typeof table.index.$get, 401>>().toHaveProperty("error");
  await expect(parseResponse(table.index.$get())).rejects.toBeInstanceOf(DetailedError);
});

it("サイズ制限による拒否でも業務RPCのコードとrequest IDを返す", async () => {
  // Given: 業務JSON RPCの2 MiB制限を超える本文。
  const body = "x".repeat(2 * 1024 * 1024 + 1);
  // When: bodyLimitがrouteより先に拒否する。
  const response = await app.request("/api/admin/stores", { method: "POST", body }, env);
  // Then: global middlewareとroute例外の照合方法を統一する。
  expect(response.status).toBe(413);
  expect(apiErrorSchema.parse(await response.json())).toMatchObject({
    error: { code: "BODY_TOO_LARGE" },
    traceId: response.headers.get("X-Request-Id"),
  });
});

it("入力検証は項目の制約を日英で返し、入力値や正規表現を公開しない", async () => {
  // Given: 文字数・形式・数値上限に同時に違反する店舗作成入力。
  const secret = "private-input-".repeat(20);
  // When: 実routeでZodの検証を行う。
  const response = await app.request(
    "/api/admin/stores",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: secret, slug: "PRIVATE SLUG", tableCount: 101 }),
    },
    env,
  );
  // Then: 修正箇所と具体的な制約を表示でき、入力本文はレスポンスに含まない。
  expect(response.status).toBe(422);
  const body: unknown = await response.json();
  const parsed = apiErrorSchema.parse(body);
  const issues = validationIssuesSchema.parse(parsed.error.details);
  for (const [path, maximum] of [
    ["name", "150"],
    ["tableCount", "100"],
  ]) {
    const issue = issues.find((item) => item.path[0] === path);
    expect(issue?.code).toBe("too_big");
    expect(issue?.messages.ja).toContain(maximum);
    expect(issue?.messages.en).toContain(maximum);
  }
  expect(issues.find((item) => item.path[0] === "slug")?.code).toBe("invalid_format");
  expect(JSON.stringify(body)).not.toContain(secret);
  expect(JSON.stringify(body)).not.toContain("PRIVATE SLUG");
  expect(JSON.stringify(body)).not.toContain("^[a-z0-9-]+$");
  expect(
    issues.every((issue) => Object.keys(issue).toSorted().join(",") === "code,messages,path"),
  ).toBe(true);
});
