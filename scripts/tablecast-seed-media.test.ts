import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { getPlatformProxy } from "wrangler";
import { demoStores } from "./tablecast-fixtures.ts";
import { demoImageKey, imageKey, seedMenuImages } from "./tablecast-seed-media.ts";
it("画像内容が同じならキーを再利用し、差し替えた内容だけ別キーになる", () => {
  // Given: 同じ内容と変更した内容の画像。
  const original = new TextEncoder().encode("tablecast-image");
  // When / Then: 内容に基づいてURLのidentityを決定する。
  expect(imageKey(original)).toMatch(/^tablecast\/images\/[a-f0-9]{64}\.png$/);
  expect(imageKey(original)).toBe(imageKey(original.slice()));
  expect(imageKey(original)).not.toBe(imageKey(new TextEncoder().encode("replacement")));
  expect(imageKey(original, "webp")).toMatch(/^tablecast\/images\/[a-f0-9]{64}\.webp$/);
  expect(imageKey(original, "webp")).not.toBe(imageKey(original));
});

it("実R2で遅い画像を待たず4枠を使い、再配備・欠損復旧・複数ページで既存画像を再送しない", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-media-test-"));
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "tablecast-media-test",
      compatibility_date: "2026-09-03",
      images: { binding: "TABLECAST_IMAGES" },
      r2_buckets: [{ binding: "TABLECAST_MEDIA", bucket_name: "tablecast-media-test" }],
    }),
  );
  const platform = await getPlatformProxy<Pick<TablecastEnv, "TABLECAST_MEDIA">>({
    configPath,
    persist: false,
  });
  const real = platform.env.TABLECAST_MEDIA;
  let limit = 1000;
  const releaseFirst = Promise.withResolvers<void>();
  const releaseOthers = Promise.withResolvers<void>();
  let firstPending = true;
  let holdFirst = true;
  let active = 0;
  let maximum = 0;
  const bucket = {
    list: vi.fn<R2Bucket["list"]>((options) => real.list({ ...options, limit })),
    head: vi.fn<R2Bucket["head"]>((key) => real.head(key)),
    put: vi.fn<
      (
        key: string,
        bytes: Uint8Array,
        options: R2PutOptions & { onlyIf: R2Conditional },
      ) => Promise<null | R2Object>
    >(async (key, bytes, options) => {
      const first = holdFirst;
      holdFirst = false;
      active++;
      maximum = Math.max(maximum, active);
      try {
        if (first) await releaseFirst.promise;
        else await releaseOthers.promise;
        return await real.put(key, bytes, options);
      } finally {
        active--;
        if (first) firstPending = false;
      }
    }),
  };
  const configurations = demoStores("demo").map((store) => store.configuration);
  try {
    const initial = seedMenuImages(bucket, false, configurations);
    try {
      // ファイル読込速度によらず4枠すべての実書込みが到達してから空き枠を解放する。
      await vi.waitFor(() => expect(active).toBe(4));
      releaseOthers.resolve();
      // 最初の一枚が遅くても、完了した枠が次の画像の実R2書込みへ進む。
      await vi.waitFor(() => expect(bucket.put.mock.calls.length).toBeGreaterThan(4));
      expect(firstPending).toBe(true);
      expect(maximum).toBe(4);
    } finally {
      releaseOthers.resolve();
      releaseFirst.resolve();
      await initial;
    }
    const first = await initial;
    expect(first.uploaded).toBeGreaterThan(100);
    expect(first.confirmed).toBe(0);
    for (const configuration of configurations) {
      for (const logo of [
        configuration.branding?.logo,
        configuration.branding?.banner,
        ...Object.values(configuration.appearance?.assets ?? {}),
        ...(configuration.banners ?? []).map((banner) => banner.image),
      ]) {
        if (!logo) throw new Error("seedの店舗ロゴが必要です。");
        const image = await real.get(logo.imageKey);
        expect(image?.httpMetadata?.contentType).toBe("image/webp");
        expect(image?.customMetadata?.storeId).toMatch(/^tablecast-/);
        expect(JSON.parse(image?.customMetadata?.metadata ?? "null")).toEqual({
          imageKind: logo.imageKind,
          imageSource: logo.imageSource,
        });
        expect((await image?.arrayBuffer())?.byteLength).toBeGreaterThan(0);
      }
    }
    expect(await real.head(demoImageKey("prawn-tempura.png"))).toBeNull();
    expect(first.uploadedBytes).toBeGreaterThan(0);
    expect(bucket.list).toHaveBeenCalledTimes(1);
    expect(bucket.head).not.toHaveBeenCalled();
    expect(bucket.put).toHaveBeenCalledTimes(first.uploaded);
    const call = bucket.put.mock.calls[0];
    if (!call) throw new Error("初回投入がありません。");
    const key = call[0];
    const original = await real.get(key);
    if (!original) throw new Error("投入済み画像がありません。");
    const bytes = await original.arrayBuffer();
    bucket.list.mockClear();
    bucket.put.mockClear();
    expect(await seedMenuImages(bucket, false, configurations)).toEqual({
      uploaded: 0,
      confirmed: first.uploaded,
      uploadedBytes: 0,
    });
    expect(bucket.list).toHaveBeenCalledTimes(1);
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.head).not.toHaveBeenCalled();

    // 欠損した一枚だけを補い、既存の画像へ書き込まない。
    await real.delete(key);
    expect(await seedMenuImages(bucket, false, configurations)).toEqual({
      uploaded: 1,
      confirmed: first.uploaded - 1,
      uploadedBytes: bytes.byteLength,
    });
    expect(bucket.put).toHaveBeenCalledTimes(1);
    expect(await (await real.get(key))?.arrayBuffer()).toEqual(bytes);

    // 小さいページでcursorによる続きを実bindingから取得する。
    limit = 32;
    bucket.list.mockClear();
    bucket.put.mockClear();
    expect(await seedMenuImages(bucket, false, configurations)).toEqual({
      uploaded: 0,
      confirmed: first.uploaded,
      uploadedBytes: 0,
    });
    expect(bucket.list).toHaveBeenCalledTimes(Math.ceil(first.uploaded / 32));
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.head).not.toHaveBeenCalled();

    await real.put(key, "unexpected-content");
    await expect(seedMenuImages(bucket, false, configurations)).rejects.toThrow("R2画像投入失敗");
    expect(await (await real.get(key))?.text()).toBe("unexpected-content");
    expect(bucket.put).not.toHaveBeenCalled();
  } finally {
    await platform.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
