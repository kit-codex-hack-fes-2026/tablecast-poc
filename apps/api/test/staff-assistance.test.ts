import { env, exports } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import * as business from "../src/db/business-schema";
import { configurationErrors } from "../src/modules/catalog/pricing";
import {
  createDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration/use-cases/drafts";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { getServiceGuidance, getStaffCalls } from "../src/modules/tables/assistance-queries";
import { getTableState } from "../src/modules/tables/queries";
import { callStaff, resolveCall } from "../src/modules/tables/use-cases/presentation";
import { createApiServices } from "../src/platform/context";
import { coreStateSchema, staffCallPageSchema } from "../src/schema";
import { fixtureDb } from "./database-fixture";
import { configuration, device, deviceToken, setupFixture, text } from "./fixture";

const services = () => createApiServices(env);
const handoff = {
  summaryJa: "お冷を2つ希望。商品の案内では解決せず店員を希望。",
  originalText: "Could we have two glasses of water, please?",
  locale: "en" as const,
  attempted: ["お冷の注文方法を案内"],
  unresolved: "お冷2つの提供",
};
const request = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set("Cookie", `tablecast.device=${deviceToken}`);
  headers.set("Origin", "http://localhost:3000");
  return exports.default.fetch(
    new Request(`http://localhost:3000/api/table${path}`, { ...init, headers }),
  );
};

it("HTTP呼び出しのメモと状態を保存し、店員の対応済み後も客の履歴に残す", async () => {
  const { staff } = await setupFixture();
  const response = await request("/call?view=core", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...handoff, idempotencyKey: "tablecast-assistance-request" }),
  });
  expect(response.status).toBe(200);
  const state = coreStateSchema.parse(await response.json());
  expect(state.staffCall).toMatchObject({ status: "pending", handoff });
  expect(state.staffCalled).toBe(true);
  await resolveCall(services(), staff, state.staffCall?.id);
  const history = await request("/calls");
  expect(history.status).toBe(200);
  const page = staffCallPageSchema.parse(await history.json());
  expect(page.calls).toHaveLength(1);
  expect(page.calls[0]).toMatchObject({ status: "resolved", handoff });
  expect(page.calls[0]?.resolvedAt).toBeTypeOf("number");
  expect((await getTableState(services(), device)).staffCall).toBeNull();
});

it("連打・同時呼び出し・対応済み後の再送で依頼とイベントを重複させない", async () => {
  const { staff } = await setupFixture();
  const input = { ...handoff, idempotencyKey: "tablecast-assistance-retry" };
  await Promise.all([
    callStaff(services(), device, "core", input),
    callStaff(services(), device, "core", input),
  ]);
  await callStaff(services(), device, "core", {
    ...input,
    idempotencyKey: "tablecast-another-press",
  });
  await resolveCall(services(), staff);
  await callStaff(services(), device, "core", input);
  const page = await getStaffCalls(services(), device, { limit: 20 });
  expect(page.calls).toHaveLength(1);
  expect(page.calls[0]?.status).toBe("resolved");
  const events = await fixtureDb
    .select()
    .from(business.tableEvents)
    .where(
      and(
        eq(business.tableEvents.table_session_id, device.tableSessionId),
        eq(business.tableEvents.kind, "staff.called"),
      ),
    );
  expect(events).toHaveLength(1);
});

it("履歴をページ送りでき、会話ログの上限と別来店の記録に影響されない", async () => {
  await setupFixture();
  const rows = Array.from({ length: 25 }, (_, index) => ({
    id: `tablecast-call-${String(index).padStart(3, "0")}`,
    store_id: device.storeId,
    table_session_id: device.tableSessionId,
    idempotency_key: `tablecast-key-${index}`,
    status: "resolved" as const,
    handoff_json: JSON.stringify(handoff),
    created_at: 1000,
    resolved_at: 2000,
  }));
  const firstRow = rows[0];
  if (!firstRow) throw new Error("履歴のfixtureが必要です");
  await fixtureDb.batch([
    fixtureDb.insert(business.staffCalls).values(firstRow),
    ...rows.slice(1).map((row) => fixtureDb.insert(business.staffCalls).values(row)),
  ]);
  await fixtureDb.insert(business.tableSessions).values({
    id: "tablecast-other-visit",
    store_id: device.storeId,
    kind: "demo",
    locale: "ja",
    guest_count: 1,
    opened_at: 100,
  });
  await fixtureDb.insert(business.staffCalls).values({
    ...firstRow,
    id: "tablecast-private-call",
    table_session_id: "tablecast-other-visit",
    idempotency_key: "tablecast-other-key",
  });
  const first = await getStaffCalls(services(), device, { limit: 20 });
  expect(first.calls).toHaveLength(20);
  const second = await getStaffCalls(services(), device, {
    limit: 20,
    beforeCreatedAt: first.nextCursor?.createdAt,
    beforeId: first.nextCursor?.id,
  });
  expect(second.calls).toHaveLength(5);
  expect(new Set([...first.calls, ...second.calls].map((call) => call.id)).size).toBe(25);
  expect(second.nextCursor).toBeNull();
  expect(
    [...first.calls, ...second.calls].some((call) => call.id === "tablecast-private-call"),
  ).toBe(false);
  const state = await callStaff(services(), device, "core", handoff);
  await fixtureDb.batch([
    fixtureDb.insert(business.tableEvents).values({
      store_id: device.storeId,
      table_session_id: device.tableSessionId,
      kind: "voice.user",
      data_json: "{}",
      created_at: 3000,
    }),
    ...Array.from({ length: 104 }, (_, index) =>
      fixtureDb.insert(business.tableEvents).values({
        store_id: device.storeId,
        table_session_id: device.tableSessionId,
        kind: "voice.user",
        data_json: "{}",
        created_at: 3001 + index,
      }),
    ),
  ]);
  expect((await getTableState(services(), device)).staffCall?.id).toBe(state.staffCall?.id);
  expect((await getStaffCalls(services(), device, { limit: 50 })).calls).toHaveLength(26);
  const unauthorized = await request("/calls?tableSessionId=tablecast-other-visit");
  expect(unauthorized.status).toBe(400);
});

it("他店舗の来店と客による対応済み操作を拒否する", async () => {
  await setupFixture();
  await expect(
    getStaffCalls(services(), { ...device, storeId: "tablecast-foreign-store" }, { limit: 20 }),
  ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
  await expect(resolveCall(services(), device)).rejects.toMatchObject({ code: "STAFF_REQUIRED" });
});

it("古い呼び出しへの対応済み操作が新しい依頼を閉じない", async () => {
  const { staff } = await setupFixture();
  const first = await callStaff(services(), device, "core", handoff);
  await resolveCall(services(), staff, first.staffCall?.id);
  const next = await callStaff(services(), device, "core", handoff);
  await expect(resolveCall(services(), staff, first.staffCall?.id)).rejects.toMatchObject({
    code: "STAFF_CALL_STALE",
  });
  expect((await getTableState(services(), device)).staffCall?.id).toBe(next.staffCall?.id);
});

it("公開された案内と商品を検索し、未公開情報と架空の回答を出さない", async () => {
  const { staff } = await setupFixture();
  const guides = [
    {
      id: "tablecast-water-guide",
      text: text("お冷", "Water"),
      productIds: ["tea"],
      links: [
        { label: { ja: "お店のSNS", en: "Social media" }, url: "https://example.com/restaurant" },
      ],
    },
  ];
  const guide = guides[0];
  if (!guide) throw new Error("案内のfixtureが必要です");
  const draft = await createDraft(services(), staff);
  const saved = await updateDraft(services(), staff, draft.id, {
    expectedVersion: draft.version,
    configuration: { ...configuration, guides },
  });
  expect((await getServiceGuidance(services(), device, {})).guides).toEqual([]);
  const ready = await validateDraft(services(), staff, draft.id, saved.version);
  expect(ready.errors).toEqual([]);
  await publishDraft(services(), staff, draft.id, {
    expectedVersion: ready.version,
    baseVersion: ready.baseVersion,
    idempotencyKey: "tablecast-publish-guides",
    approved: true,
  });
  const guidance = await getServiceGuidance(services(), device, { guideId: guide.id });
  expect(guidance.guides[0]?.text.displayName).toBe("お冷");
  expect(guidance.products.map((product) => product.id)).toContain("tea");
  expect((await getTableState(services(), device)).staffCalled).toBe(false);
  expect(
    (await getServiceGuidance(services(), device, { query: "存在しない用件xyz" })).guides,
  ).toEqual([]);
  expect(
    configurationErrors({
      ...configuration,
      guides: [{ ...guide, productIds: ["tablecast-missing-product"] }],
    }),
  ).toContainEqual({
    code: "PRODUCT_NOT_FOUND",
    path: ["guides", 0, "productIds", 0],
    params: { productId: "tablecast-missing-product" },
  });
});

it("ひとつの案内に紐付く商品も最後のページまで重複なく取得できる", async () => {
  await setupFixture();
  const product = configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const products = Array.from({ length: 11 }, (_, index) => ({
    ...product,
    id: `tablecast-service-${index}`,
  }));
  const guide = {
    id: "tablecast-services",
    text: text("備品", "Supplies"),
    productIds: products.map((item) => item.id),
    links: [],
  };
  await fixtureDb
    .update(business.stores)
    .set({ config_json: JSON.stringify({ ...configuration, products, guides: [guide] }) })
    .where(eq(business.stores.id, device.storeId));
  const first = await getServiceGuidance(services(), device, { guideId: guide.id });
  const second = await getServiceGuidance(services(), device, {
    guideId: guide.id,
    offset: first.nextOffset ?? 0,
  });
  const last = await getServiceGuidance(services(), device, {
    guideId: guide.id,
    offset: second.nextOffset ?? 0,
  });
  expect([...first.products, ...second.products, ...last.products].map((item) => item.id)).toEqual(
    products.map((item) => item.id),
  );
  expect(last.nextOffset).toBeNull();
});

it("呼び出しの言語を省略した場合も現在の来店言語で原文を保存する", async () => {
  await setupFixture();
  await fixtureDb
    .update(business.tableSessions)
    .set({ locale: "en" })
    .where(eq(business.tableSessions.id, device.tableSessionId));
  const state = await callStaff(services(), device, "core", {
    originalText: "Please call a staff member.",
  });
  expect(state.staffCall?.handoff.locale).toBe("en");
});

it("従来の空JSON本文の呼び出しを受け付け、壊れたJSONでは新しい依頼を作らない", async () => {
  await setupFixture();
  const accepted = await request("/call?view=core", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  expect(accepted.status).toBe(200);
  const rejected = await request("/call?view=core", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  expect(rejected.status).toBe(400);
  expect((await getStaffCalls(services(), device, { limit: 20 })).calls).toHaveLength(1);
});

it("お冷の自動候補に説明文や部分一致だけの酒類を混ぜず、登録した別名でサービス商品を見つける", async () => {
  await setupFixture();
  const source = configuration.products[0];
  if (!source) throw new Error("商品fixtureが必要です");
  const whisky = { ...source, id: "water", text: text("ウイスキーの水割り", "Whisky with water") };
  const waterText = text("お冷", "Glass of cold water");
  const water = {
    ...source,
    id: "tablecast-water",
    price: 0,
    text: { ...waterText, en: { ...waterText.en, aliases: ["Water"] } },
  };
  await fixtureDb
    .update(business.stores)
    .set({ config_json: JSON.stringify({ ...configuration, products: [whisky, water] }) })
    .where(eq(business.stores.id, device.storeId));
  const result = await getServiceGuidance(services(), device, { query: "Water" });
  expect(result.products.map((product) => product.id)).toEqual([water.id]);
  expect(result.products[0]?.price).toBe(0);
});
