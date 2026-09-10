import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";

afterEach(() => vi.restoreAllMocks());

it("通話予約中というRPC結果を受けた配備APIは409を返す", async () => {
  // Given: 実Containerの起動を伴わないRPC境界で、予約中の結果を注入する。
  const stub = env.TABLECAST_VOICE.getByName("tablecast-voice");
  vi.spyOn(stub, "setDraining").mockResolvedValueOnce(false);
  vi.spyOn(env.TABLECAST_VOICE, "getByName").mockReturnValue(stub);
  // When: 管理資格でdrainを要求する。
  const response = await app.request(
    "/internal/deploy/drain",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TABLECAST_VOICE_API_TOKEN}` },
    },
    env,
  );
  // Then: 業務上の競合を維持する。
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "VOICE_RUNTIME_BUSY" });
});

it("Container RPCが失敗すると配備APIは409へ握りつぶさず500と診断を返す", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const stub = env.TABLECAST_VOICE.getByName("tablecast-voice");
  vi.spyOn(stub, "setDraining").mockRejectedValueOnce(new Error("container control unavailable"));
  vi.spyOn(env.TABLECAST_VOICE, "getByName").mockReturnValue(stub);
  const response = await app.request(
    "/internal/deploy/drain",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TABLECAST_VOICE_API_TOKEN}` },
    },
    env,
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  expect(logged).toHaveBeenCalledTimes(1);
  expect(String(logged.mock.calls[0]?.[0])).toContain("container control unavailable");
});
