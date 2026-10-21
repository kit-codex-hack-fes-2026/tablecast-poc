import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import { member } from "../src/db/auth-schema";
import {
  billingOutbox,
  organizationAi,
  organizationAiKeys,
  organizationCosts,
  billingSync,
  voiceUsageSessions,
  responseUsage,
} from "../src/db/business-schema";
import { createApiServices } from "../src/platform/context";
import {
  beginVoiceUsage,
  recordVoiceUsage,
  voiceBillingAccount,
} from "../src/modules/billing/usage";
import {
  pendingOrganizationKey,
  provisionOrganizationKey,
  organizationCredential,
  sessionCredential,
} from "../src/modules/billing/credentials";
import { syncOrganizationCosts } from "../src/modules/billing/sync";
import { createStore } from "../src/modules/stores/service";
import { billingPricingVersion } from "../src/modules/billing/pricing";
import { setupFixture } from "./fixture";

const configured = () => ({
  ...env,
  TABLECAST_ORGANIZATION_AI_ENABLED: "true",
  TABLECAST_OPENAI_ADMIN_API_KEY: "tablecast-test-admin-key",
  TABLECAST_OPENAI_PROJECT_ID: "proj_tablecast_test",
  TABLECAST_OPENAI_KEY_ENCRYPTION_SECRET: "tablecast-local-encryption-secret-32-characters",
  TABLECAST_BILLING_ENABLED: "false",
});
afterEach(() => vi.restoreAllMocks());
const providerAccount = (id = "acct_tablecast") => ({
  id,
  object: "organization.project.service_account",
  created_at: 1,
  role: "member",
  api_key: {
    id: "key_tablecast",
    value: "tablecast-secret-org-key",
    name: "default",
    created_at: 1,
    object: "organization.project.service_account.api_key",
  },
});
function provider() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input),
      method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method === "POST") return Response.json(providerAccount());
    if (method === "DELETE") return Response.json({ id: "acct_tablecast", deleted: true });
    expect(url).toContain("service_accounts");
    return Response.json({
      object: "list",
      data: [],
      has_more: false,
      first_id: null,
      last_id: null,
    });
  });
}

it("店舗作成batchで発行待ちを残し、外部失敗後も組織とownerを保持する", async () => {
  const { staff } = await setupFixture();
  const services = createApiServices(configured());
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("provider secret must not leak"));
  const result = await createStore(services, staff.userId, {
    name: "新店舗",
    slug: "tablecast-billing-new",
    tableCount: 2,
  });
  expect(
    await services.db
      .select()
      .from(organizationAi)
      .where(eq(organizationAi.organizationId, result.id))
      .get(),
  ).toMatchObject({ state: "failed" });
  expect(
    await services.db.select().from(member).where(eq(member.organizationId, result.id)),
  ).toHaveLength(1);
  vi.restoreAllMocks();
  provider();
  await provisionOrganizationKey(services, result.id);
  expect(await organizationCredential(services, result.id)).toEqual({
    id: "key_tablecast",
    apiKey: "tablecast-secret-org-key",
  });
  const saved = await services.db.select().from(organizationAiKeys).get();
  expect(saved?.encryptedKey).not.toContain("tablecast-secret-org-key");
});
it("並行発行を一度に制限し、失われた応答の固定名資源を回収する", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await pendingOrganizationKey(services, "tablecast-org");
  const fetch = provider();
  await Promise.all([
    provisionOrganizationKey(services, "tablecast-org"),
    provisionOrganizationKey(services, "tablecast-org"),
  ]);
  expect(
    fetch.mock.calls.filter(
      ([input, init]) =>
        (init?.method ?? (input instanceof Request ? input.method : "GET")) === "POST",
    ),
  ).toHaveLength(1);
  expect(await services.db.select().from(organizationAiKeys)).toHaveLength(1);
  expect(await sessionCredential(services, "key_tablecast")).toBe("tablecast-secret-org-key");
});
it.each([
  {
    pricingVersion: "openai-2026-10-18",
    model: "gpt-5.6-luna",
    serviceTier: "priority",
    charge: 73600,
  },
  {
    pricingVersion: billingPricingVersion,
    model: "gpt-6-luna",
    serviceTier: "priority",
    charge: 33600,
  },
  {
    pricingVersion: billingPricingVersion,
    model: "gpt-6-luna",
    serviceTier: "fast",
    charge: 33600,
  },
])(
  "$pricingVersionの$model・$serviceTierで累積秒とResponsesの再送を重複計上しない",
  async ({ pricingVersion, model, serviceTier, charge }) => {
    await setupFixture();
    const services = createApiServices(configured());
    await pendingOrganizationKey(services, "tablecast-org");
    provider();
    await provisionOrganizationKey(services, "tablecast-org");
    const selected = await voiceBillingAccount(services, "tablecast-store");
    await beginVoiceUsage(
      services,
      "live_tablecast",
      "tablecast-store",
      "tablecast-session",
      false,
      selected,
    );
    expect(await services.db.select().from(voiceUsageSessions).get()).toMatchObject({
      pricingVersion: billingPricingVersion,
    });
    if (pricingVersion !== billingPricingVersion) {
      await services.db
        .update(voiceUsageSessions)
        .set({ pricingVersion })
        .where(eq(voiceUsageSessions.id, "live_tablecast"));
    }
    const voice = (seconds: number, type = "session.usage.updated") =>
      recordVoiceUsage(services, "live_tablecast", { type, usage: { seconds } });
    await Promise.all([voice(30), voice(60)]);
    await voice(30);
    await voice(90, "session.closed");
    await voice(90, "session.closed");
    const response = {
      type: "response.event",
      event: {
        type: "response.completed",
        response: {
          id: "resp_tablecast",
          model,
          service_tier: serviceTier,
          usage: {
            input_tokens: 1000,
            input_tokens_details: { cached_tokens: 500 },
            output_tokens: 100,
          },
        },
      },
    };
    await Promise.all([
      recordVoiceUsage(services, "live_tablecast", response),
      recordVoiceUsage(services, "live_tablecast", response),
    ]);
    const outbox = await services.db.select().from(billingOutbox);
    expect(outbox.reduce((sum, row) => sum + row.seconds, 0)).toBe(90);
    expect(outbox.reduce((sum, row) => sum + row.chargeMicros, 0)).toBe(12_000_000 + charge);
    expect(await services.db.select().from(responseUsage)).toMatchObject([
      { model, serviceTier, chargeMicros: charge },
    ]);
    expect(await services.db.select().from(voiceUsageSessions).get()).toMatchObject({
      seconds: 90,
      final: true,
    });
    const changed = createApiServices({
      ...services.env,
      TABLECAST_BILLING_RATES: JSON.stringify({ ...selected.rates, markupBps: 20000 }),
    });
    await expect(voiceBillingAccount(changed, "tablecast-store")).rejects.toMatchObject({
      code: "BILLING_VERSION_CHANGED",
    });
  },
);
it("memberの本番HTTP応答から金額とStripe情報を除き、他組織の閲覧を拒否する", async () => {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(env);
  await services.db
    .update(member)
    .set({ role: "member" })
    .where(and(eq(member.organizationId, "tablecast-org"), eq(member.userId, staff.userId)));
  const request = (path: string) =>
    app.fetch(new Request(`http://localhost:3000${path}`, { headers: { Cookie: cookie } }), env);
  const response = await request("/api/admin/organizations/tablecast-org/billing");
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain('"financial":null');
  for (const forbidden of [
    "chargeMicros",
    "stripeCustomerId",
    "markup",
    "amountUsd",
    "encryptedKey",
  ])
    expect(body).not.toContain(forbidden);
  expect((await request("/api/admin/organizations/tablecast-org/billing/invoices")).status).toBe(
    403,
  );
  expect(
    (await request("/api/admin/organizations/tablecast-fixture-other-org/billing")).status,
  ).toBe(403);
});
it("Costsの全ページを取得して当月を置換し、前の月と未帰属を保持する", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await pendingOrganizationKey(services, "tablecast-org");
  provider();
  await provisionOrganizationKey(services, "tablecast-org");
  vi.restoreAllMocks();
  let amount = 2;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const next = (input instanceof Request ? input.url : String(input)).includes(
      "page=tablecast-next",
    );
    return Response.json({
      has_more: !next,
      next_page: next ? null : "tablecast-next",
      data: [
        {
          start_time: Date.parse("2026-10-02Z") / 1000,
          results: [
            {
              api_key_id: next ? "unknown-key" : "key_tablecast",
              line_item: "voice",
              amount: { currency: "usd", value: next ? 1 : amount },
            },
          ],
        },
      ],
    });
  });
  const first = Date.parse("2026-10-03Z");
  await syncOrganizationCosts(services, first);
  amount = 3;
  await syncOrganizationCosts(services, first + 86400001);
  const rows = await services.db.select().from(organizationCosts);
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.organizationId === "tablecast-org")?.amountUsd).toBe("3");
  expect(rows.find((row) => row.organizationId === null)?.amountUsd).toBe("1");
  expect(
    await services.db.select().from(billingSync).where(eq(billingSync.id, "costs:2026-10")).get(),
  ).toMatchObject({ completedAt: first + 86400001 });
});

it("外部作成後のD1保存失敗を回収し、組織を再試行可能な状態へ戻す", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await services.db.insert(organizationAiKeys).values({
    id: "key_tablecast",
    organizationId: "tablecast-fixture-other-org",
    projectId: "proj_tablecast_test",
    serviceAccountId: "acct_other",
    encryptedKey: "other-secret-ciphertext",
    createdAt: 1,
  });
  await pendingOrganizationKey(services, "tablecast-org");
  const fetch = provider();
  await provisionOrganizationKey(services, "tablecast-org");
  expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
  expect(
    await services.db
      .select()
      .from(organizationAi)
      .where(eq(organizationAi.organizationId, "tablecast-org"))
      .get(),
  ).toMatchObject({ state: "failed", credentialId: null });
  expect(await services.db.select().from(organizationAiKeys)).toHaveLength(1);
});
it("応答が失われたService Accountを照合してから再作成する", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await pendingOrganizationKey(services, "tablecast-org");
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    calls.push(request.method);
    if (request.method === "GET")
      return Response.json({
        data: [{ id: "acct_lost", name: "tablecast-test-tablecast-org" }],
        has_more: false,
      });
    if (request.method === "DELETE") return Response.json({ id: "acct_lost", deleted: true });
    return Response.json(providerAccount());
  });
  await provisionOrganizationKey(services, "tablecast-org");
  expect(calls).toEqual(["GET", "DELETE", "POST"]);
  expect(await organizationCredential(services, "tablecast-org")).toMatchObject({
    id: "key_tablecast",
  });
});
it("Costsの途中失敗を0円や部分snapshotとして公開しない", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("page=")) return new Response("unavailable", { status: 503 });
    return Response.json({
      has_more: true,
      next_page: "tablecast-next",
      data: [
        {
          start_time: 1,
          results: [
            { api_key_id: null, line_item: "voice", amount: { currency: "usd", value: 10 } },
          ],
        },
      ],
    });
  });
  await expect(syncOrganizationCosts(services)).rejects.toThrow("OPENAI_COSTS_SYNC_FAILED");
  expect(await services.db.select().from(organizationCosts)).toEqual([]);
  expect(
    await services.db.select().from(billingSync).where(eq(billingSync.id, "openai-costs")).get(),
  ).toMatchObject({ completedAt: null });
});

it("運営収支を明示allowlistへ限定し、未取得の原価と入金をnullで返す", async () => {
  const { staff, cookie } = await setupFixture();
  const path =
    "http://localhost:3000/api/operations/organizations/tablecast-org/billing?month=2026-10";
  const request = () => new Request(path, { headers: { Cookie: cookie } });
  expect((await app.fetch(request(), env)).status).toBe(403);
  const response = await app.fetch(request(), {
    ...env,
    TABLECAST_BILLING_OPERATOR_USER_IDS: staff.userId,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    costs: { amountUsd: null, fetchedAt: null },
    costJpy: null,
    revenue: null,
  });
});

it("開始前の0秒通知と開始後の0秒確定で初期料金を二重計上しない", async () => {
  await setupFixture();
  const services = createApiServices(configured());
  await pendingOrganizationKey(services, "tablecast-org");
  provider();
  await provisionOrganizationKey(services, "tablecast-org");
  const account = await voiceBillingAccount(services, "tablecast-store");
  await beginVoiceUsage(
    services,
    "live_zero",
    "tablecast-store",
    "tablecast-session",
    false,
    account,
  );
  const usage = { type: "session.usage.updated", usage: { seconds: 0 } };
  await recordVoiceUsage(services, "live_zero", usage);
  await recordVoiceUsage(services, "live_zero", usage);
  let events = await services.db.select().from(billingOutbox);
  expect(events.reduce((total, row) => total + row.chargeMicros, 0)).toBe(2000000);
  await recordVoiceUsage(services, "live_zero", { type: "session.started" });
  await recordVoiceUsage(services, "live_zero", usage);
  await recordVoiceUsage(services, "live_zero", { type: "session.closed", usage: { seconds: 0 } });
  events = await services.db.select().from(billingOutbox);
  expect(events.reduce((total, row) => total + row.chargeMicros, 0)).toBe(0);
});
