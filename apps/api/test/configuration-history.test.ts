import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import * as business from "../src/db/business-schema";
import { member } from "../src/db/auth-schema";
import { createApiServices } from "../src/platform/context";
import { getCatalog } from "../src/modules/catalog/queries";
import { publishDraft, updateDraft, validateDraft } from "../src/modules/configuration/service";
import {
  configDraftSchema,
  configurationHistoryPageSchema,
  configurationReleaseSchema,
} from "../src/schema";
import { fixtureDb, insertFixture } from "./database-fixture";
import { prepareConfirmation, submitOrder, updateCart } from "../src/modules/orders/service";
import { configuration, setupFixture, device } from "./fixture";

const base = "http://localhost:3000/api/admin/stores/tablecast-store/configuration";

it("履歴は大量の商品snapshotを返さず、同一時刻の公開版と下書きも30件ずつ辿れる", async () => {
  const { staff, cookie } = await setupFixture();
  const expanded = {
    ...configuration,
    products: Array.from({ length: 100 }, (_, i) => ({
      ...configuration.products[0],
      id: `tablecast-product-${i}`,
    })),
  };
  const now = Date.now();
  await env.TABLECAST_DB.batch([
    ...Array.from({ length: 31 }, (_, i) =>
      insertFixture(business.configReleases, {
        store_id: staff.storeId,
        version: i + 1,
        config_json: JSON.stringify(expanded),
        published_by: staff.userId,
        created_at: now,
      }),
    ),
    insertFixture(business.configDrafts, {
      id: "tablecast-discarded",
      store_id: staff.storeId,
      base_version: 1,
      status: "discarded",
      config_json: JSON.stringify(expanded),
      created_by: staff.userId,
      created_at: now,
      updated_at: now,
    }),
  ]);
  const first = await exports.default.fetch(
    new Request(`${base}/history`, { headers: { Cookie: cookie } }),
  );
  expect(first.status).toBe(200);
  const raw = await first.json();
  const page = configurationHistoryPageSchema.parse(raw);
  expect(page.entries).toHaveLength(30);
  expect(JSON.stringify(raw)).not.toContain("products");
  expect(JSON.stringify(raw).length).toBeLessThan(12000);
  expect(page.entries[0]).toMatchObject({
    actorName: "店員",
    actorEmail: "tablecast-staff@example.test",
    actorImage: null,
  });
  if (!page.nextCursor) throw new Error("履歴の続きが必要です");
  const query = new URLSearchParams({
    ...page.nextCursor,
    beforeAt: String(page.nextCursor.beforeAt),
  });
  const next = await exports.default.fetch(
    new Request(`${base}/history?${query.toString()}`, { headers: { Cookie: cookie } }),
  );
  const last = configurationHistoryPageSchema.parse(await next.json());
  expect(last.entries).toHaveLength(2);
  expect(last.entries.at(-1)).toMatchObject({ kind: "draft", status: "discarded", baseVersion: 1 });
  expect(
    new Set([...page.entries, ...last.entries].map((row) => `${row.kind}/${row.id}`)).size,
  ).toBe(32);
  expect(last.nextCursor).toBeNull();
  expect(page.entries.every((row) => row.sourceDraftId === null)).toBe(true);
});

it("空の履歴・欠損した公開版・非互換snapshotを正常な空状態と復元不能として区別する", async () => {
  const { staff, cookie } = await setupFixture();
  const headers = { Cookie: cookie };
  const empty = await exports.default.fetch(new Request(`${base}/history`, { headers }));
  expect(configurationHistoryPageSchema.parse(await empty.json()).entries).toEqual([]);
  expect((await exports.default.fetch(new Request(`${base}/releases/1`, { headers }))).status).toBe(
    404,
  );
  await fixtureDb.insert(business.configReleases).values({
    store_id: staff.storeId,
    version: 1,
    config_json: "{}",
    published_by: staff.userId,
    created_at: Date.now(),
  });
  const invalid = await exports.default.fetch(new Request(`${base}/releases/1`, { headers }));
  expect(configurationReleaseSchema.parse(await invalid.json())).toMatchObject({
    configuration: null,
    publisherName: "店員",
    publisherEmail: "tablecast-staff@example.test",
    publisherImage: null,
  });
  const restore = await exports.default.fetch(
    new Request(`${base}/releases/1/restore`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: crypto.randomUUID(), baseVersion: 1 }),
    }),
  );
  expect(restore.status).toBe(422);
  expect(await fixtureDb.select().from(business.configDrafts)).toHaveLength(0);
});

it("履歴と復元は店舗境界・管理権限・入力形式を守る", async () => {
  const { cookie } = await setupFixture();
  for (const { path, auth, status } of [
    { path: `${base}/history`, auth: "", status: 401 },
    {
      path: base.replace("tablecast-store", "tablecast-other-store") + "/history",
      auth: cookie,
      status: 403,
    },
    { path: `${base}/history?beforeId=only-id`, auth: cookie, status: 400 },
    { path: `${base}/releases/invalid`, auth: cookie, status: 400 },
  ])
    expect(
      (await exports.default.fetch(new Request(path, { headers: { Cookie: auth } }))).status,
    ).toBe(status);
  await fixtureDb.update(member).set({ role: "member" }).where(eq(member.id, "tablecast-member"));
  for (const path of ["history", "releases/1"])
    expect(
      (await exports.default.fetch(new Request(`${base}/${path}`, { headers: { Cookie: cookie } })))
        .status,
    ).toBe(403);
  const restore = await exports.default.fetch(
    new Request(`${base}/releases/1/restore`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: crypto.randomUUID(), baseVersion: 1 }),
    }),
  );
  expect(restore.status).toBe(403);
});

it("過去版は新しい下書きとなり、同じ要求の再送・版競合・通常の検証と公開でも履歴を保つ", async () => {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(env);
  const old = {
    ...configuration,
    cast: { ...configuration.cast, proactive: !configuration.cast.proactive },
  };
  await fixtureDb.insert(business.configReleases).values([
    {
      store_id: staff.storeId,
      version: 1,
      config_json: JSON.stringify(old),
      published_by: staff.userId,
      created_at: 1,
    },
    {
      store_id: staff.storeId,
      version: 2,
      config_json: JSON.stringify(configuration),
      published_by: staff.userId,
      created_at: 2,
    },
  ]);
  await fixtureDb
    .update(business.stores)
    .set({ config_version: 2 })
    .where(eq(business.stores.id, staff.storeId));
  const cart = await updateCart(services, device, {
    expectedVersion: 0,
    lines: [{ id: "tablecast-order-tea", productId: "tea", quantity: 1, selections: [] }],
  });
  const confirmation = await prepareConfirmation(services, device, {
    expectedVersion: cart.cart.version,
    channel: "gui",
  });
  const order = await submitOrder(services, device, {
    snapshotId: confirmation.id,
    approved: true,
    idempotencyKey: "tablecast-history-order",
  });
  const body = { draftId: crypto.randomUUID(), baseVersion: 2 };
  const request = (input = body) =>
    new Request(`${base}/releases/1/restore`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  const response = await exports.default.fetch(request());
  expect(response.status).toBe(200);
  const restored = configDraftSchema.parse(await response.json());
  expect(restored).toMatchObject({
    id: body.draftId,
    baseVersion: 2,
    status: "draft",
    configuration: old,
  });
  expect(restored.changes).toHaveLength(1);
  expect((await getCatalog(services, staff.storeId)).configuration).toEqual(configuration);
  const [retry, parallel] = await Promise.all([
    exports.default.fetch(request()),
    exports.default.fetch(request()),
  ]);
  expect(retry.status).toBe(200);
  expect(parallel.status).toBe(200);
  expect(await fixtureDb.select().from(business.configDrafts)).toHaveLength(1);
  expect(
    (await exports.default.fetch(request({ draftId: crypto.randomUUID(), baseVersion: 1 }))).status,
  ).toBe(409);
  const edited = await updateDraft(services, staff, restored.id, {
    expectedVersion: restored.version,
    configuration: restored.configuration,
  });
  await validateDraft(services, staff, edited.id, edited.version);
  const input = {
    expectedVersion: edited.version,
    baseVersion: 2,
    idempotencyKey: crypto.randomUUID(),
    approved: true as const,
  };
  await publishDraft(services, staff, edited.id, input);
  await publishDraft(services, staff, edited.id, input);
  const storedOrder = await fixtureDb
    .select({ snapshot: business.orders.snapshot_json })
    .from(business.orders)
    .where(eq(business.orders.id, order.id))
    .get();
  expect(storedOrder?.snapshot).toBe(JSON.stringify(order.snapshot));
  const releases = await fixtureDb.select().from(business.configReleases);
  expect(releases).toHaveLength(3);
  expect(releases.find((row) => row.version === 1)?.config_json).toBe(JSON.stringify(old));
  expect(releases.find((row) => row.version === 2)?.config_json).toBe(
    JSON.stringify(configuration),
  );
  expect(releases.find((row) => row.version === 3)?.source_draft_id).toBe(edited.id);
  const history = await exports.default.fetch(
    new Request(`${base}/history`, { headers: { Cookie: cookie } }),
  );
  expect(configurationHistoryPageSchema.parse(await history.json()).entries).toContainEqual(
    expect.objectContaining({
      kind: "draft",
      id: edited.id,
      restoredFromVersion: 1,
      baseVersion: 2,
      status: "published",
    }),
  );
});
