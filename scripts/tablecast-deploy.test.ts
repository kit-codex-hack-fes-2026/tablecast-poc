import { afterEach, describe, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { waitForRelease } from "./tablecast-deploy";
import { uploadPreviewImage } from "./tablecast-seed-media";

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

describe("PR商品画像の投入", () => {
  const bytes = new TextEncoder().encode("tablecast-image");
  const stored = {
    key: "tablecast/demo/tofu.png",
    version: "test",
    size: bytes.length,
    etag: createHash("md5").update(bytes).digest("hex"),
    httpEtag: '"test"',
    uploaded: new Date(0),
    storageClass: "Standard",
    checksums: { toJSON: () => ({}) },
    writeHttpMetadata: () => {},
  } satisfies R2Object;
  function bucket() {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    return {
      head: vi.fn<R2Bucket["head"]>().mockResolvedValue(null),
      put: vi
        .fn<(key: string, bytes: Uint8Array, options: R2PutOptions) => Promise<R2Object | null>>()
        .mockResolvedValue(stored),
    };
  }
  test("保存済み画像は内容を確認し再送せず、異なる画像は上書きしない", async () => {
    const media = bucket();
    media.head.mockResolvedValueOnce(stored).mockResolvedValueOnce({
      ...stored,
      etag: "different",
    });
    await uploadPreviewImage(media, stored.key, bytes);
    await expect(uploadPreviewImage(media, stored.key, bytes)).rejects.toThrow("R2画像投入失敗");
    expect(media.put).not.toHaveBeenCalled();
  });
  test("10001の直後は存在を再確認し、未保存なら条件付きで再送する", async () => {
    vi.useFakeTimers();
    const media = bucket();
    media.put.mockRejectedValueOnce(new Error("put: Internal error (10001)"));
    const result = uploadPreviewImage(media, stored.key, bytes);
    await vi.runAllTimersAsync();
    await result;
    expect(media.head).toHaveBeenCalledTimes(2);
    expect(media.put).toHaveBeenCalledTimes(2);
    expect(media.put).toHaveBeenLastCalledWith(
      stored.key,
      bytes,
      expect.objectContaining({ md5: stored.etag, onlyIf: { etagDoesNotMatch: "*" } }),
    );
  });
  test("応答だけ失われたputは保存内容を確認して再送しない", async () => {
    vi.useFakeTimers();
    const media = bucket();
    media.head.mockResolvedValueOnce(null).mockResolvedValueOnce(stored);
    media.put.mockRejectedValueOnce(new Error("put: Internal error (10001)"));
    const result = uploadPreviewImage(media, stored.key, bytes);
    await vi.runAllTimersAsync();
    await result;
    expect(media.put).toHaveBeenCalledTimes(1);
  });
  test.each([
    { code: "10001", attempts: 3 },
    { code: "10003", attempts: 1 },
  ])("R2 $codeは上限$attempts回で失敗しkeyとcodeを示す", async ({ code, attempts }) => {
    vi.useFakeTimers();
    const media = bucket();
    media.put.mockRejectedValue(new Error(`put: failure (${code})`));
    await Promise.all([
      expect(uploadPreviewImage(media, stored.key, bytes)).rejects.toThrow(
        `R2画像投入失敗: ${stored.key} (code=${code}, attempt=${attempts})`,
      ),
      vi.runAllTimersAsync(),
    ]);
    expect(media.put).toHaveBeenCalledTimes(attempts);
  });
  test("条件競合や保存結果の不一致を成功にしない", async () => {
    const media = bucket();
    media.put.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...stored, size: 0 });
    await expect(uploadPreviewImage(media, stored.key, bytes)).rejects.toThrow("R2画像投入失敗");
    await expect(uploadPreviewImage(media, stored.key, bytes)).rejects.toThrow("R2画像投入失敗");
    expect(media.put).toHaveBeenCalledTimes(2);
  });
});
