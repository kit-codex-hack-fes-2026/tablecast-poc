import { afterEach, describe, expect, test, vi } from "vitest";
import { waitForRelease } from "./tablecast-deploy";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("配備先のSHA確認", () => {
  test("配備直後に接続失敗と旧SHAが返っても新SHAの応答まで待つ", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError("接続失敗"))
      .mockResolvedValueOnce(Response.json({ releaseSha: "old" }))
      .mockResolvedValueOnce(Response.json({ releaseSha: "new" }));
    vi.stubGlobal("fetch", fetch);

    const result = waitForRelease(
      "https://tablecast.example.test",
      { authorization: "test" },
      "new",
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(
      "https://tablecast.example.test/api/health",
      expect.objectContaining({ headers: { authorization: "test" }, redirect: "manual" }),
    );
  });

  test("未認証のHTML応答が続く場合は期限内で失敗し成功扱いにしない", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => new Response("Access login", { status: 302 }));
    vi.stubGlobal("fetch", fetch);

    const result = waitForRelease("https://tablecast.example.test", {}, "new");
    await Promise.all([
      expect(result).rejects.toThrow("配備先のrelease SHAを期限内に確認できません。"),
      vi.runAllTimersAsync(),
    ]);
    expect(fetch).toHaveBeenCalledTimes(12);
  });
});
