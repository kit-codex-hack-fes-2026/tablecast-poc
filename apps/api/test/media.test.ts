import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("R2の商品画像を公式Images binding経由のWebPとして配信する", async () => {
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    ),
    (character) => character.charCodeAt(0),
  );
  await env.TABLECAST_MEDIA.put("tablecast/demo/tablecast-test.png", png, {
    httpMetadata: { contentType: "image/png" },
  });
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/media/tablecast/demo/tablecast-test.png"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(response.headers.get("ETag")).toContain("640-webp");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect(
    (
      await exports.default.fetch(
        new Request("http://localhost:3000/media/tablecast/demo/missing.png"),
      )
    ).status,
  ).toBe(404);
});

it("画像幅とETagが一致するときは再変換せず304を返し、過大な幅を拒否する", async () => {
  // Given: R2に保存した画像とサイズ別のETag。
  await env.TABLECAST_MEDIA.put("tablecast/demo/tablecast-cached.png", "cached-image");
  const asset = await env.TABLECAST_MEDIA.head("tablecast/demo/tablecast-cached.png");
  if (!asset) throw new Error("画像fixtureがありません");
  const etag = `W/"${asset.etag}-128-webp"`;
  // When: 同じサイズの条件付きリクエストを送る。
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/media/tablecast/demo/tablecast-cached.png?width=128", {
      headers: { "If-None-Match": etag },
    }),
  );
  // Then: 画像デコードなしで304を返し、上限外の幅は400になる。
  expect(response.status).toBe(304);
  expect(response.headers.get("ETag")).toBe(etag);
  expect(await response.text()).toBe("");
  for (const width of ["0", "1601", "NaN", "1.5"]) {
    expect(
      (
        await exports.default.fetch(
          new Request(
            `http://localhost:3000/media/tablecast/demo/tablecast-cached.png?width=${width}`,
          ),
        )
      ).status,
    ).toBe(400);
  }
});

it("ハッシュ付き画像だけ長期保存を許可し、固定キーは毎回再検証する", async () => {
  // Given: 新形式と既存形式の画像。
  for (const key of [
    `tablecast/images/${"a".repeat(64)}.png`,
    `tablecast/images/${"b".repeat(64)}.webp`,
    "tablecast/demo/legacy.png",
  ]) {
    await env.TABLECAST_MEDIA.put(key, "image");
    const asset = await env.TABLECAST_MEDIA.head(key);
    if (!asset) throw new Error("画像がありません");
    // When: 同じ画像の条件付きリクエストを送る。
    const response = await exports.default.fetch(
      new Request(`http://localhost:3000/media/${key}?width=128`, {
        headers: { "If-None-Match": `W/"${asset.etag}-128-webp"` },
      }),
    );
    // Then: immutableは新形式だけに適用する。
    expect(response.status).toBe(304);
    expect(response.headers.get("Cache-Control")).toBe(
      key.includes("/images/") ? "public, max-age=31536000, immutable" : "public, no-cache",
    );
  }
});

it("変換結果を再利用し、幅・元画像の更新・削除をキャッシュから分離する", async () => {
  const key = "tablecast/demo/tablecast-transform-cache.png";
  const png = Uint8Array.fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  );
  await env.TABLECAST_MEDIA.put(key, png);
  const url = `http://localhost:3000/media/${key}?width=128`;
  const first = await exports.default.fetch(new Request(url));
  expect(first.status).toBe(200);
  expect(first.headers.get("X-Tablecast-Image-Cache")).toBe("MISS");
  const bytes = await first.arrayBuffer();
  await expect
    .poll(async () => {
      const repeat = await exports.default.fetch(new Request(`${url}&ignored=value`));
      expect(await repeat.arrayBuffer()).toEqual(bytes);
      expect(repeat.headers.get("Cache-Control")).toBe("public, no-cache");
      return repeat.headers.get("X-Tablecast-Image-Cache");
    })
    .toBe("HIT");

  const otherWidth = await exports.default.fetch(new Request(url.replace("128", "256")));
  expect(otherWidth.headers.get("X-Tablecast-Image-Cache")).toBe("MISS");
  expect(otherWidth.headers.get("ETag")).not.toBe(first.headers.get("ETag"));
  await otherWidth.arrayBuffer();
  const unchanged = await exports.default.fetch(
    new Request(url, {
      headers: { "If-None-Match": first.headers.get("ETag") ?? "" },
    }),
  );
  expect(unchanged.status).toBe(304);
  expect(await unchanged.text()).toBe("");

  // 同じキーを別の実画像バイト列へ差し替え、旧ETagでは304にもcache hitにもならない。
  await env.TABLECAST_MEDIA.put(key, bytes);
  const updated = await exports.default.fetch(
    new Request(url, {
      headers: { "If-None-Match": first.headers.get("ETag") ?? "" },
    }),
  );
  expect(updated.status).toBe(200);
  expect(updated.headers.get("X-Tablecast-Image-Cache")).toBe("MISS");
  expect(updated.headers.get("ETag")).not.toBe(first.headers.get("ETag"));
  await updated.arrayBuffer();
  await env.TABLECAST_MEDIA.delete(key);
  expect((await exports.default.fetch(new Request(url))).status).toBe(404);
});
