import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api-fetch";
import { demoTableEndpoint } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { tableOptions } from "./table-query";
vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
afterEach(() => vi.resetAllMocks());

it("卓の401だけをペアリングへ戻し、スタッフデモの401は認証エラーとして保持する", async () => {
  // Given: 同じ401を返すHTTP接続境界。
  vi.mocked(apiFetch).mockImplementation(async () =>
    Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    // When / Then: 客の端末接続復帰と、スタッフの認証復帰を混同しない。
    expect(await client.fetchQuery(tableOptions(client))).toBeNull();
    const error: unknown = await client
      .fetchQuery(tableOptions(client, demoTableEndpoint("store", "demo")))
      .catch((failure: unknown) => failure);
    expect(apiError(error)?.status).toBe(401);
  } finally {
    client.clear();
  }
});
