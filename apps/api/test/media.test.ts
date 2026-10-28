import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { demoSessions, devices, mediaAssets, stores } from "../src/db/business-schema";
import { member } from "../src/db/identity-schema";
import { createAuth } from "../src/modules/auth/service";
import { getCatalog } from "../src/modules/catalog/queries";
import { createDemo } from "../src/modules/demo/service";
import { migrateImageAssets } from "../src/modules/media/migration";
import { generateImageAsset } from "../src/modules/media/placeholder";
import { createApiServices } from "../src/platform/context";
import { fixtureDb } from "./database-fixture";
import { configuration, deviceToken, setupFixture } from "./fixture";

const png = Uint8Array.fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
);
const key = `tablecast/images/${"a".repeat(64)}.png`;
const origin = "http://localhost:3000";
let fixture: Awaited<ReturnType<typeof setupFixture>>;
beforeEach(async () => {
  fixture = await setupFixture();
});
async function seed(imageKey = key) {
  await env.TABLECAST_MEDIA.put(imageKey, png);
  await fixtureDb
    .insert(mediaAssets)
    .values({
      store_id: fixture.staff.storeId,
      image_key: imageKey,
      ...(await generateImageAsset(env.TABLECAST_IMAGES, png.buffer)),
    })
    .onConflictDoNothing();
}
function request(path: string, cookie = fixture.cookie, etag?: string) {
  return exports.default.fetch(
    new Request(origin + path, {
      headers: {
        Cookie: cookie,
        ...(etag ? { "If-None-Match": etag } : {}),
      },
    }),
  );
}
const path = (imageKey = key, width = 128) =>
  `/api/admin/stores/tablecast-store/images/${imageKey}?width=${width}`;

it("認可済みのR2画像をImages bindingでWebPへ変換し、公開の旧経路を閉じる", async () => {
  await seed();
  const response = await request(path());
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(response.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect((await request(`/media/${key}`)).status).toBe(404);
  expect((await request(path("tablecast/images/missing.png"))).status).toBe(404);
});

it("認可後に幅別の304を返し、過大・不正な幅を拒否する", async () => {
  await seed();
  const first = await request(path());
  await first.arrayBuffer();
  const etag = first.headers.get("ETag") ?? "";
  expect(etag).toContain("128-webp");
  expect(etag).toContain("q85-v2");
  const response = await request(path(), fixture.cookie, etag);
  expect(response.status).toBe(304);
  expect(await response.text()).toBe("");
  for (const width of ["0", "1601", "NaN", "1.5"]) {
    expect((await request(path().replace("128", width))).status).toBe(400);
  }
});

it("内部cache hitと条件付き要求でも未認証・別店舗・失効端末を拒否する", async () => {
  await seed();
  const first = await request(path());
  await first.arrayBuffer();
  const etag = first.headers.get("ETag") ?? "";
  await expect
    .poll(async () => {
      const response = await request(path());
      await response.arrayBuffer();
      return response.headers.get("X-Tablecast-Image-Cache");
    })
    .toBe("HIT");
  const devicePath = `/api/table/images/${key}?width=128`;
  expect((await request(devicePath, `tablecast.device=${deviceToken}`)).status).toBe(200);
  for (const tag of [undefined, etag]) {
    expect((await request(path(), "", tag)).status).toBe(401);
    expect(
      (await request(path().replace("tablecast-store/", "tablecast-other/"), fixture.cookie, tag))
        .status,
    ).toBe(403);
  }
  await fixtureDb
    .update(devices)
    .set({ revoked_at: Date.now() })
    .where(eq(devices.id, "tablecast-device"));
  for (const tag of [undefined, etag])
    expect((await request(devicePath, `tablecast.device=${deviceToken}`, tag)).status).toBe(401);
  // 同じ画像キーを知っていても、その店舗の索引がなければ取得できない。
  await fixtureDb.delete(mediaAssets).where(eq(mediaAssets.store_id, fixture.staff.storeId));
  expect((await request(path(), fixture.cookie, etag)).status).toBe(404);
});

it("デモ画像はデモを所有するスタッフだけが取得できる", async () => {
  await seed();
  const demo = await createDemo(createApiServices(env), fixture.staff);
  const url = `/api/admin/stores/tablecast-store/demo/${demo.id}/table/images/${key}`;
  const response = await request(url);
  expect(response.status).toBe(200);
  await response.arrayBuffer();
  const etag = response.headers.get("ETag") ?? "";
  expect((await request(url, "")).status).toBe(401);
  expect((await request(url.replace(demo.id, "tablecast-other-demo"))).status).toBe(404);
  const identity = await createAuth(env).$context;
  const other = await identity.internalAdapter.createUser(
    { email: "tablecast-other-demo@example.test", name: "別の所有者", emailVerified: true },
    { method: "admin" },
  );
  await fixtureDb
    .update(demoSessions)
    .set({ created_by: other.id })
    .where(eq(demoSessions.session_id, demo.id));
  for (const tag of [undefined, etag])
    expect((await request(url, fixture.cookie, tag)).status).toBe(404);
  await fixtureDb
    .update(demoSessions)
    .set({ created_by: fixture.staff.userId })
    .where(eq(demoSessions.session_id, demo.id));
  await fixtureDb.update(member).set({ role: "member" }).where(eq(member.id, "tablecast-member"));
  for (const tag of [undefined, etag])
    expect((await request(url, fixture.cookie, tag)).status).toBe(403);
});

it("変換結果を再利用し、幅・元画像の更新・削除を内部cacheから分離する", async () => {
  const legacy = "tablecast/demo/cache.png";
  await seed(legacy);
  const url = path(legacy);
  const first = await request(url);
  const bytes = await first.arrayBuffer();
  expect(first.headers.get("X-Tablecast-Image-Cache")).toBe("MISS");
  await expect
    .poll(async () => {
      const response = await request(`${url}&ignored=value`);
      expect(await response.arrayBuffer()).toEqual(bytes);
      expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
      return response.headers.get("X-Tablecast-Image-Cache");
    })
    .toBe("HIT");
  const other = await request(path(legacy, 256));
  expect(other.headers.get("X-Tablecast-Image-Cache")).toBe("MISS");
  await other.arrayBuffer();
  await env.TABLECAST_MEDIA.put(legacy, bytes);
  const changed = await request(url, fixture.cookie, first.headers.get("ETag") ?? "");
  expect(changed.status).toBe(200);
  expect(changed.headers.get("X-Tablecast-Image-Cache")).toBe("MISS");
  expect(changed.headers.get("ETag")).not.toBe(first.headers.get("ETag"));
  await changed.arrayBuffer();
  await env.TABLECAST_MEDIA.delete(legacy);
  expect((await request(url)).status).toBe(404);
});

it("既存画像の移行は寸法・BlurHashと店舗別索引だけを生成し、再実行と共有キーを保つ", async () => {
  await env.TABLECAST_MEDIA.put(key, png);
  const config = {
    ...configuration,
    products: configuration.products.map((product) => ({ ...product, imageKey: key })),
  };
  const json = JSON.stringify(config);
  await fixtureDb.update(stores).set({ config_json: json });
  const original = await fixtureDb.select().from(stores).get();
  if (!original) throw new Error("店舗がありません");
  await fixtureDb
    .insert(stores)
    .values({ ...original, id: "tablecast-other", organization_id: "tablecast-fixture-other-org" });
  expect(await migrateImageAssets(env)).toEqual({ inserted: 2, updated: 0, missing: [] });
  expect(await migrateImageAssets(env)).toEqual({ inserted: 0, updated: 0, missing: [] });
  await fixtureDb.update(mediaAssets).set({ blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" });
  expect(await migrateImageAssets(env)).toEqual({ inserted: 0, updated: 2, missing: [] });
  expect(await migrateImageAssets(env)).toEqual({ inserted: 0, updated: 0, missing: [] });
  const rows = await fixtureDb.select().from(mediaAssets);
  expect(rows).toHaveLength(2);
  expect(rows[0]?.blurhash).toHaveLength(52);
  expect(rows[0]).toMatchObject({
    width: 1,
    height: 1,
  });
  expect((await fixtureDb.select().from(stores)).every((row) => row.config_json === json)).toBe(
    true,
  );
  expect((await env.TABLECAST_MEDIA.list({ prefix: "tablecast/images/" })).objects).toHaveLength(1);
  const catalog: unknown = await (
    await request("/api/admin/stores/tablecast-store/catalog")
  ).json();
  expect(catalog).toMatchObject({ imageAssets: { [key]: { width: 1, height: 1 } } });
  expect(await getCatalog(createApiServices(env), fixture.staff.storeId)).not.toHaveProperty(
    "imageAssets",
  );
});
