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
  for (const key of [`tablecast/images/${"a".repeat(64)}.png`, "tablecast/demo/legacy.png"]) {
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
