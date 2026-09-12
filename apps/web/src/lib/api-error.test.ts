import { createTablecastClient, DetailedError, parseResponse } from "@tablecast/api/client";
import { expect, it } from "vitest";
import { apiError } from "./api-error";

it("検証エラーをhcと標準解析で受けると、status・details・request IDを保持する", async () => {
  // Given: APIの公開envelopeを返すHTTP境界。
  const details = [{ code: "VOICE_MISSING", path: ["cast", "voice", "ja"] }];
  const client = createTablecastClient("https://tablecast.test", {
    fetch: async () =>
      Response.json(
        { error: { code: "INVALID_INPUT", details }, traceId: "tablecast-request" },
        { status: 422 },
      ),
  });
  // When: 標準parseResponseが非2xxを解析する。
  const error: unknown = await parseResponse(client.api.admin.stores.$get()).catch(
    (failure: unknown) => failure,
  );
  // Then: 独自例外へ置換せず、公開本文だけを検証して取り出す。
  expect(error).toBeInstanceOf(DetailedError);
  expect(apiError(error)).toEqual({
    status: 422,
    code: "INVALID_INPUT",
    details,
    requestId: "tablecast-request",
  });
});

it.each([
  {
    name: "未知JSON",
    response: () => Response.json({ error: "private provider error" }, { status: 503 }),
  },
  {
    name: "HTML",
    response: () =>
      new Response("<h1>private proxy error</h1>", {
        status: 503,
        headers: { "Content-Type": "text/html" },
      }),
  },
  { name: "空本文", response: () => new Response(null, { status: 503 }) },
])("$nameの応答でもstatusを維持し、未検証の本文を取り出さない", async ({ response }) => {
  // Given: 業務API以外からのエラー本文。
  const client = createTablecastClient("https://tablecast.test", { fetch: async () => response() });
  // When: Hono標準の例外を公開境界で読む。
  const error: unknown = await parseResponse(client.api.admin.stores.$get()).catch(
    (failure: unknown) => failure,
  );
  // Then: 生の本文をcodeやdetailsとして表示しない。
  expect(apiError(error)).toEqual({
    status: 503,
    code: undefined,
    details: undefined,
    requestId: undefined,
  });
});

it.each([new TypeError("network"), new SyntaxError("invalid JSON"), new Error("local"), null])(
  "HTTP応答のない例外%sにstatusや業務コードを捏造しない",
  (error) => {
    expect(apiError(error)).toBeUndefined();
  },
);
