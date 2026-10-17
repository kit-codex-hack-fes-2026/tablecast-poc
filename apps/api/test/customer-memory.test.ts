import { updateCart, prepareConfirmation, submitOrder } from "../src/modules/orders/service";
import { getTableState } from "../src/modules/tables/queries";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, assert, expect, it, vi } from "vitest";
import { user } from "../src/db/auth-schema";
import {
  customerMemories,
  customerMemorySources,
  tableSessions,
  tableEvents,
} from "../src/db/business-schema";
import { createApiServices } from "../src/platform/context";
import { enrolCustomer, updateCustomerPreferences } from "../src/modules/customers/service";
import { createCustomerVisitCode, joinCustomerVisit } from "../src/modules/customer-visits/service";
import {
  customerSuggestions,
  listCustomerConsumption,
  customerServiceTarget,
  listCustomerMemories,
  customerRecommendationContext,
} from "../src/modules/customer-memory/queries";
import {
  recordCustomerConsumption,
  deleteCustomerMemory,
  recordCustomerMemorySource,
  saveAutomaticCustomerMemory,
  selectCustomerTarget,
  writeCustomerMemory,
} from "../src/modules/customer-memory/service";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { fixtureDb } from "./database-fixture";
import { device, setupFixture } from "./fixture";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup() {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const customer = { kind: "customer", userId: staff.userId, storeId: device.storeId } as const;
  await enrolCustomer(services, customer);
  const tablet = { ...device, deviceId: "tablecast-device" };
  const code = await createCustomerVisitCode(services, tablet);
  await joinCustomerVisit(services, customer.userId, code.code);
  return { services, customer, tablet, code };
}
async function activate() {
  await fixtureDb
    .update(tableSessions)
    .set({
      voice_state: "active",
      voice_session_id: "tablecast-memory-voice",
      active_turn_id: "tablecast-memory-turn",
    })
    .where(eq(tableSessions.id, device.tableSessionId));
  return {
    ...device,
    kind: "voice",
    voiceSessionId: "tablecast-memory-voice",
    turnId: "tablecast-memory-turn",
  } as const;
}
it("記憶の本人CRUDは店舗と会員を分離し、編集競合を拒否する", async () => {
  const { services, customer } = await setup();
  const id = crypto.randomUUID();
  await writeCustomerMemory(services, customer, { id, revision: 0, content: "甘さ控えめが好き" });
  await writeCustomerMemory(services, customer, { id, revision: 1, content: "甘くないものが好き" });
  await expect(
    writeCustomerMemory(services, customer, { id, revision: 1, content: "古い編集" }),
  ).rejects.toMatchObject({ code: "CUSTOMER_MEMORY_STALE" });
  expect((await listCustomerMemories(services, customer, { limit: 20 })).memories[0]?.content).toBe(
    "甘くないものが好き",
  );
  await expect(
    listCustomerMemories(services, { ...customer, userId: "other" }, { limit: 20 }),
  ).rejects.toMatchObject({ code: "CUSTOMER_MEMBERSHIP_REQUIRED" });
  await deleteCustomerMemory(services, customer, id, 2);
  expect((await listCustomerMemories(services, customer, { limit: 20 })).memories).toHaveLength(0);
});
it("自動記憶は現在の本人発話だけを採用し、再送で本人の編集を上書きしない", async () => {
  const { services, customer } = await setup();
  const actor = await activate();
  await recordCustomerMemorySource(services, actor, "私は甘さ控えめが好きです");
  const source = await fixtureDb.select().from(customerMemorySources).get();
  assert(source);
  const input = {
    sourceId: source.id,
    quote: "私は甘さ控えめが好きです",
    clearFirstPersonPreference: true,
  } as const;
  expect(await saveAutomaticCustomerMemory(services, actor, input)).toEqual({ saved: true });
  expect(await saveAutomaticCustomerMemory(services, actor, input)).toEqual({ saved: false });
  const memory = await fixtureDb.select().from(customerMemories).get();
  assert(memory);
  await writeCustomerMemory(services, customer, {
    id: memory.id,
    revision: 1,
    content: "本人による訂正",
  });
  await expect(saveAutomaticCustomerMemory(services, actor, input)).rejects.toMatchObject({
    code: "VOICE_SESSION_STALE",
  });
  expect((await listCustomerMemories(services, customer, { limit: 20 })).memories[0]?.content).toBe(
    "本人による訂正",
  );
});
it("複数人では共通接客に戻り、明示選択・同意撤回で音声と遅着保存を失効させる", async () => {
  const { services, customer, tablet, code } = await setup();
  const oldActor = await activate();
  await recordCustomerMemorySource(services, oldActor, "私はジンが好きです");
  await fixtureDb.insert(user).values({
    id: "tablecast-memory-other",
    name: "同行者",
    email: "memory-other@example.test",
    updatedAt: new Date(),
  });
  await enrolCustomer(services, { ...customer, userId: "tablecast-memory-other" });
  await joinCustomerVisit(services, "tablecast-memory-other", code.code);
  let target = await customerServiceTarget(services, tablet);
  expect(target.target).toBeUndefined();
  expect(target.session.voice_session_id).toBeNull();
  expect((await customerRecommendationContext(services, tablet)).needsTarget).toBe(true);
  assert(target.context);
  const selected = target.participants.find((p) => p.membership.userId === customer.userId);
  assert(selected);
  await selectCustomerTarget(services, tablet, {
    token: target.context.token,
    participantId: selected.participant.id,
  });
  target = await customerServiceTarget(services, tablet);
  expect(target.target?.membership.userId).toBe(customer.userId);
  const actor = await activate();
  await recordCustomerMemorySource(services, actor, "私は辛口が好きです");
  const source = (await fixtureDb.select().from(customerMemorySources)).find((row) =>
    row.content.includes("辛口"),
  );
  assert(source);
  await updateCustomerPreferences(services, customer, {
    revision: 1,
    shareCompanions: true,
    useMemories: false,
    saveMemories: false,
  });
  await expect(
    saveAutomaticCustomerMemory(services, actor, {
      sourceId: source.id,
      quote: source.content,
      clearFirstPersonPreference: true,
    }),
  ).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
  expect(await fixtureDb.select().from(customerMemories)).toHaveLength(0);
});
it("会員参加後の個人字幕を卓全体の状態や通知へ保存しない", async () => {
  const { services, tablet } = await setup();
  const actor = await activate();
  await recordConversationItems(services, tablet, {
    voiceSessionId: actor.voiceSessionId,
    items: [{ itemId: "personal", role: "user", text: "私の好み", interrupted: false }],
  });
  expect(
    (await fixtureDb.select().from(tableEvents)).some((event) =>
      event.data_json.includes("私の好み"),
    ),
  ).toBe(false);
});

it("個人の飲食編集は注文・会計原本を変更せず、未体験の候補に反映する", async () => {
  const { services, customer, tablet } = await setup();
  const state = await getTableState(services, tablet);
  const cart = await updateCart(services, tablet, {
    expectedVersion: state.cart.version,
    lines: [{ id: "memory-tea", productId: "tea", quantity: 2, selections: [] }],
  });
  const snapshot = await prepareConfirmation(services, tablet, {
    expectedVersion: cart.cart.version,
    channel: "gui",
  });
  const order = await submitOrder(services, tablet, {
    snapshotId: snapshot.id,
    idempotencyKey: "tablecast-memory-order",
    approved: true,
  });
  const original = await getTableState(services, tablet);
  await recordCustomerConsumption(services, customer, {
    orderId: order.id,
    lineId: "memory-tea",
    quantity: 1,
    shared: true,
    revision: 0,
  });
  expect(
    (await customerSuggestions(services, tablet, { kind: "untried", offset: 0 })).products.some(
      (p) => p.id === "tea",
    ),
  ).toBe(false);
  expect(
    (await customerSuggestions(services, tablet, { kind: "usual", offset: 0 })).products.some(
      (p) => p.id === "tea",
    ),
  ).toBe(true);
  await recordCustomerConsumption(services, customer, {
    orderId: order.id,
    lineId: "memory-tea",
    quantity: 0,
    shared: true,
    revision: 1,
  });
  expect(
    (await customerSuggestions(services, tablet, { kind: "untried", offset: 0 })).products.some(
      (p) => p.id === "tea",
    ),
  ).toBe(true);
  const after = await getTableState(services, tablet);
  expect(after.orders).toEqual(original.orders);
  expect(after.bill).toEqual(original.bill);
  expect(
    (await listCustomerConsumption(services, customer, { limit: 20 })).records[0]?.quantity,
  ).toBe(0);
});

it.each(["context", "usual", "untried"] as const)(
  "%sの対象取得後に同意を撤回したら最終読取りを拒否する",
  async (kind) => {
    const { services, customer } = await setup();
    await writeCustomerMemory(services, customer, {
      id: crypto.randomUUID(),
      revision: 0,
      content: "辛口が好き",
    });
    const actor = await activate();
    const captured = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const batch = env.TABLECAST_DB.batch.bind(env.TABLECAST_DB);
    vi.spyOn(env.TABLECAST_DB, "batch").mockImplementationOnce(
      async <T>(statements: D1PreparedStatement[]) => {
        const result = await batch<T>(statements);
        captured.resolve();
        await release.promise;
        return result;
      },
    );
    const reading =
      kind === "context"
        ? customerRecommendationContext(services, actor)
        : customerSuggestions(services, actor, { kind, offset: 0 });
    const rejected = reading.then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await captured.promise;
      await updateCustomerPreferences(services, customer, {
        revision: 1,
        shareCompanions: true,
        useMemories: false,
        saveMemories: false,
      });
    } finally {
      release.resolve();
    }
    await expect(rejected).resolves.toMatchObject({ code: "CUSTOMER_CONTEXT_STALE" });
  },
);

it("文脈解除のDB完了後に別の解除が入っても元の音声を一度停止する", async () => {
  const { services, customer } = await setup();
  await activate();
  const stopping = {
    ...services,
    env: { ...services.env, TABLECAST_MODEL_API_KEY: "tablecast-test-key" },
  };
  const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 404 }),
  );
  vi.stubGlobal("fetch", fetcher);
  const captured = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const batch = env.TABLECAST_DB.batch.bind(env.TABLECAST_DB);
  vi.spyOn(env.TABLECAST_DB, "batch").mockImplementationOnce(
    async <T>(statements: D1PreparedStatement[]) => {
      const result = await batch<T>(statements);
      captured.resolve();
      await release.promise;
      return result;
    },
  );
  const first = writeCustomerMemory(stopping, customer, {
    id: crypto.randomUUID(),
    revision: 0,
    content: "最初の変更",
  });
  try {
    await captured.promise;
    await writeCustomerMemory(stopping, customer, {
      id: crypto.randomUUID(),
      revision: 0,
      content: "同時の変更",
    });
  } finally {
    release.resolve();
  }
  await first;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "https://api.openai.com/v1/live/sessions/tablecast-memory-voice/attach",
  );
});
