import { and, count, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import * as business from "../apps/api/src/db/business-schema";
import * as identity from "../apps/api/src/db/auth-schema";
import { seedIdentityIcon } from "./tablecast-seed-icons";
import { fakerJA as faker } from "@faker-js/faker";
import { createAuth, tablecastGoogleMockIssuer } from "../apps/api/src/modules/auth/service";
import {
  configurationErrors,
  confirmationText,
  priceCart,
} from "../apps/api/src/modules/catalog/pricing";
import type { PlanContext } from "../apps/api/src/modules/catalog/pricing";
import {
  configurationSchema,
  type CartLine,
  type Configuration,
  type Snapshot,
} from "../apps/api/src/schema";
import { demoStores } from "./tablecast-fixtures";
import type { DemoCredentials } from "./tablecast-seed";

export const tablecastHistoryBaseTime = Date.UTC(2026, 7, 1, 0, 0, 0);
type Store = ReturnType<typeof demoStores>[number] & { configVersion?: number };
type Owner = { id: string; userId: string };

export function sampleLine(config: Configuration, index = 2): CartLine {
  const products = config.products.filter((item) => item.available);
  const product = products[index % products.length];
  if (!product) throw new Error("デモの販売商品がありません。");
  return {
    id: "tablecast-demo-line",
    productId: product.id,
    quantity: 1,
    selections: product.modifiers.flatMap((group) =>
      group.options
        .filter((option) => option.available)
        .slice(0, group.min)
        .map((option) => ({ optionId: option.id, quantity: 1 })),
    ),
  };
}

type SeedEvent = { storeId: string; sessionId: string; kind: string; data: string; at: number };
function event(
  storeId: string,
  sessionId: string,
  kind: string,
  data: Record<string, unknown>,
  at: number,
  history = false,
): SeedEvent {
  return {
    storeId,
    sessionId,
    kind,
    data: JSON.stringify({ source: history ? "synthetic-history" : "synthetic-demo", ...data }),
    at,
  };
}
async function insertSession(
  db: DrizzleD1Database,
  statements: (BatchItem<"sqlite"> | SeedEvent)[],
) {
  const queries: BatchItem<"sqlite">[] = [];
  const events: SeedEvent[] = [];
  for (const statement of statements) {
    if ("kind" in statement) events.push(statement);
    else queries.push(statement);
  }
  // 全列数を含めてもD1の100 bind制限に収まる行数に区切る。
  for (let offset = 0; offset < events.length; offset += 16) {
    queries.push(
      db.insert(business.tableEvents).values(
        events.slice(offset, offset + 16).map((item) => ({
          store_id: item.storeId,
          table_session_id: item.sessionId,
          kind: item.kind,
          data_json: item.data,
          created_at: item.at,
        })),
      ),
    );
  }
  const [first, ...rest] = queries;
  if (first) await db.batch([first, ...rest]);
}

function snapshotFor(
  store: Store,
  sessionId: string,
  lines: CartLine[],
  version: number,
  locale: "ja" | "en",
  at: number,
  plan: PlanContext | null = null,
): Snapshot {
  const cart = priceCart(store.configuration, lines, version, plan, at);
  if (!cart.complete) throw new Error("seedの必須選択が不足しています。");
  const snapshotPlan = plan
    ? {
        id: plan.id,
        name: {
          ja: plan.rules.text.ja.displayName,
          en: plan.rules.text.en.displayName,
        },
      }
    : null;
  return {
    id: `${sessionId}-confirmation-${version}`,
    tableSessionId: sessionId,
    cartVersion: version,
    configVersion: store.configVersion ?? 1,
    lines: cart.lines,
    total: cart.total,
    locale,
    text: confirmationText(cart.lines, cart.total, locale, snapshotPlan),
    expiresAt: at + 120_000,
    channel: "gui",
    status: "submitted",
    createdTurnId: null,
    plan: snapshotPlan,
  };
}

function confirmation(db: DrizzleD1Database, storeId: string, snapshot: Snapshot, at: number) {
  return db.insert(business.confirmations).values({
    id: snapshot.id,
    store_id: storeId,
    table_session_id: snapshot.tableSessionId,
    cart_version: snapshot.cartVersion,
    config_version: snapshot.configVersion,
    channel: "gui",
    status: snapshot.status,
    snapshot_json: JSON.stringify(snapshot),
    expires_at: snapshot.expiresAt,
    created_at: at,
  });
}

function order(
  db: DrizzleD1Database,
  storeId: string,
  snapshot: Snapshot,
  status: "submitted" | "accepted" | "served",
  at: number,
) {
  return db.insert(business.orders).values({
    id: `${snapshot.id}-order`,
    store_id: storeId,
    table_session_id: snapshot.tableSessionId,
    snapshot_id: snapshot.id,
    idempotency_key: `${snapshot.id}-submit`,
    status,
    snapshot_json: JSON.stringify(snapshot),
    total: snapshot.total,
    created_at: at,
    updated_at: status === "submitted" ? at : at + (status === "accepted" ? 3000 : 10000),
  });
}
function payment(
  db: DrizzleD1Database,
  storeId: string,
  sessionId: string,
  userId: string,
  amount: number,
  at: number,
) {
  return db.insert(business.payments).values({
    id: `${sessionId}-payment`,
    store_id: storeId,
    table_session_id: sessionId,
    idempotency_key: `${sessionId}-payment`,
    kind: "payment",
    amount,
    reason: "合成デモの模擬支払",
    actor_id: userId,
    created_at: at,
  });
}

async function seedHistory(db: DrizzleD1Database, store: Store, owner: Owner) {
  const previous = await db
    .select({ id: business.tableSessions.id })
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.store_id, store.id),
        like(business.tableSessions.id, "%-history-%"),
      ),
    );
  const existing = new Set(previous.map((session) => session.id));
  for (let index = 0; index < 200; index++) {
    const sessionId = `${store.id}-history-${index.toString().padStart(3, "0")}`;
    if (existing.has(sessionId)) continue;
    const tableId = `${store.id}-table-${((index % store.tableCount) + 1).toString().padStart(2, "0")}`;
    const openedAt =
      tablecastHistoryBaseTime +
      Math.floor((index * 30) / 200) * 86_400_000 +
      (9 + (index % 8)) * 3_600_000;
    const closedAt = openedAt + 75 * 60_000;
    const locale = index % 3 === 0 ? "en" : "ja";
    const guestCount = 2 + (index % 4);
    const statements: (BatchItem<"sqlite"> | SeedEvent)[] = [
      db.insert(business.tableSessions).values({
        id: sessionId,
        store_id: store.id,
        table_id: tableId,
        locale,
        status: "closed",
        guest_count: guestCount,
        cart_version: 18,
        opened_at: openedAt,
        closed_at: closedAt,
      }),
      event(store.id, sessionId, "table.opened", { guestCount, locale }, openedAt, true),
    ];
    let total = 0;
    for (let number = 0; number < 4; number++) {
      const at = openedAt + (number * 15 + 1) * 60_000;
      const version = number * 4 + 1;
      const line = sampleLine(store.configuration, index + number);
      line.quantity = 1 + ((index + number) % 2);
      const snapshot = snapshotFor(store, sessionId, [line], version, locale, at + 3000);
      total += snapshot.total;
      const orderId = `${snapshot.id}-order`;
      const productName = snapshot.lines[0]?.name[locale] ?? "";
      statements.push(
        event(
          store.id,
          sessionId,
          "voice.user",
          {
            role: "user",
            locale,
            status: "completed",
            text:
              locale === "ja"
                ? `${productName}について教えてください。`
                : `Could you tell us about ${productName}?`,
          },
          at,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.assistant",
          {
            role: "assistant",
            locale,
            status: "completed",
            text:
              locale === "ja"
                ? "アレルギーや原材料についてはスタッフへご確認ください。"
                : "Please ask a member of staff about ingredients and allergies.",
          },
          at + 1000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "cart.updated",
          { cartVersion: version, lines: [line] },
          at + 2000,
          true,
        ),
        confirmation(db, store.id, snapshot, at + 3000),
        event(
          store.id,
          sessionId,
          "confirmation.prepared",
          { snapshotId: snapshot.id },
          at + 3000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.assistant",
          { role: "assistant", locale, status: "completed", text: snapshot.text },
          at + 4000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.user",
          {
            role: "user",
            locale,
            status: "completed",
            text:
              locale === "ja"
                ? "画面で確認して注文します。"
                : "I will confirm the order on screen.",
          },
          at + 5000,
          true,
        ),
        order(db, store.id, snapshot, "served", at + 6000),
        event(
          store.id,
          sessionId,
          "order.submitted",
          { orderId, total: snapshot.total },
          at + 6000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "order.status",
          { orderId, status: "accepted" },
          at + 10_000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "order.status",
          { orderId, status: "served" },
          at + 16_000,
          true,
        ),
      );
    }
    statements.push(
      payment(db, store.id, sessionId, owner.userId, total, closedAt - 1000),
      event(
        store.id,
        sessionId,
        "billing.payment",
        { amount: total, reason: "合成デモの模擬支払" },
        closedAt - 1000,
        true,
      ),
      event(store.id, sessionId, "table.closed", {}, closedAt, true),
    );
    // 一セッションを一つのD1トランザクションに収め、履歴全体を巨大batchにしない。
    await insertSession(db, statements);
  }
}

async function seedCurrentTables(
  db: DrizzleD1Database,
  store: Store,
  owner: Owner,
  baseTime: number,
) {
  for (let number = 1; number <= store.tableCount; number++) {
    const tableId = `${store.id}-table-${number.toString().padStart(2, "0")}`;
    const sessionId = `${tableId}-session`;
    const state = number % 12;
    if (
      state === 10 ||
      (await db
        .select({ id: business.tableSessions.id })
        .from(business.tableSessions)
        .where(
          or(
            eq(business.tableSessions.id, sessionId),
            and(
              eq(business.tableSessions.table_id, tableId),
              eq(business.tableSessions.status, "open"),
            ),
          ),
        )
        .get())
    )
      continue;
    const at = baseTime - number * 3 * 60_000;
    const locale = number % 3 === 0 ? "en" : "ja";
    const guestCount = 2 + (number % 3);
    const rule = state === 6 ? store.configuration.plans[0] : null;
    const plan = rule ? { id: rule.id, startedAt: at, rules: rule } : null;
    const lines = state === 2 || state === 3 ? [sampleLine(store.configuration)] : [];
    const closed = state === 11;
    const statements: (BatchItem<"sqlite"> | SeedEvent)[] = [
      db.insert(business.tableSessions).values({
        id: sessionId,
        store_id: store.id,
        table_id: tableId,
        locale,
        status: closed ? "closed" : "open",
        guest_count: guestCount,
        cart_version: lines.length ? 1 : closed ? 6 : state >= 4 && state <= 7 ? state - 2 : 0,
        cart_json: JSON.stringify(lines),
        voice_state: state === 9 ? "error" : "stopped",
        staff_called: state === 8 ? 1 : 0,
        plan_json: plan ? JSON.stringify(plan) : null,
        opened_at: at,
        closed_at: closed ? at + 60000 : null,
      }),
      event(store.id, sessionId, "table.opened", { guestCount, locale }, at),
    ];
    if ((state >= 3 && state <= 7) || closed) {
      const snapshot = snapshotFor(
        store,
        sessionId,
        [sampleLine(store.configuration)],
        1,
        locale,
        at + 1000,
        plan ? { ...plan, guestCount, orderedQuantity: 0, lastOrderAt: null } : null,
      );
      if (state === 3) {
        snapshot.status = "pending";
        snapshot.expiresAt = baseTime + 120_000;
      }
      statements.push(
        confirmation(db, store.id, snapshot, at + 1000),
        event(store.id, sessionId, "confirmation.prepared", { snapshotId: snapshot.id }, at + 1000),
      );
      if (state !== 3) {
        const status = state === 4 ? "submitted" : state === 5 ? "accepted" : "served";
        const orderId = `${snapshot.id}-order`;
        statements.push(
          order(db, store.id, snapshot, status, at + 2000),
          event(
            store.id,
            sessionId,
            "order.submitted",
            { orderId, total: snapshot.total },
            at + 2000,
          ),
        );
        if (status !== "submitted")
          statements.push(
            event(store.id, sessionId, "order.status", { orderId, status: "accepted" }, at + 5000),
          );
        if (status === "served")
          statements.push(
            event(store.id, sessionId, "order.status", { orderId, status }, at + 12_000),
          );
        if (state === 7 || closed)
          statements.push(
            payment(db, store.id, sessionId, owner.userId, snapshot.total, at + 20_000),
            event(
              store.id,
              sessionId,
              "billing.payment",
              { amount: snapshot.total, reason: "合成デモの模擬支払" },
              at + 20_000,
            ),
          );
      }
    }
    if (closed) statements.push(event(store.id, sessionId, "table.closed", {}, at + 60_000));
    if (state === 8) statements.push(event(store.id, sessionId, "staff.called", {}, at + 1000));
    if (state === 9)
      statements.push(
        event(store.id, sessionId, "voice.error", { code: "VOICE_UNAVAILABLE" }, at + 1000),
      );
    await insertSession(db, statements);
  }
}

export type SeedEnv = Pick<
  TablecastEnv,
  | "TABLECAST_DB"
  | "TABLECAST_MEDIA"
  | "TABLECAST_AUTH_SECRET"
  | "TABLECAST_PUBLIC_ORIGIN"
  | "TABLECAST_ENV"
>;

export async function seedDemoDatabase(env: SeedEnv, credentials: DemoCredentials) {
  if (env.TABLECAST_ENV !== "development") throw new Error("seedは開発環境に限定されています。");
  return populateDemoDatabase(env, credentials);
}

export async function seedPreviewDatabase(env: SeedEnv, credentials: DemoCredentials) {
  if (
    env.TABLECAST_ENV !== "preview" ||
    !/^https:\/\/tablecast-pr-[1-9][0-9]*\.kit-codex\.workers\.dev$/.test(
      env.TABLECAST_PUBLIC_ORIGIN,
    )
  )
    throw new Error("PR初期投入の対象が不正です。");
  const db = drizzle(env.TABLECAST_DB);
  const owner = await db.select().from(business.deploymentOwner).get();
  if (
    owner?.repository !== "kit-codex-hack-fes-2026/tablecast-poc" ||
    `${owner.environment}.kit-codex.workers.dev` !== new URL(env.TABLECAST_PUBLIC_ORIGIN).hostname
  )
    throw new Error("PR初期投入の所有情報が一致しません。");
  if (owner.seeded === 1) return false;
  // 2はDB投入済み・画像待ち。営業データを再投入せず画像だけを再開する。
  if (owner.seeded === 2) return true;
  if (owner.seeded !== 0 && owner.seeded !== 3) throw new Error("PR初期投入の進捗が不正です。");
  // 3は運用者が認証fixtureだけの途中状態を確認した再開。店舗作成後には使えない。
  if (
    owner.seeded === 3 &&
    (await db.select({ id: identity.organization.id }).from(identity.organization).limit(1).get())
  )
    throw new Error("組織作成後のPR初期投入は手動確認が必要です。");
  if (
    await db
      .select({ id: identity.user.id })
      .from(identity.user)
      .where(owner.seeded === 3 ? sql`0` : undefined)
      .unionAll(db.select({ id: business.stores.id }).from(business.stores))
      .limit(1)
      .get()
  )
    throw new Error(
      "PR初期投入の途中状態または既存データがあります。上書きせず手動確認してください。",
    );
  await populateDemoDatabase(env, credentials);
  await db.update(business.deploymentOwner).set({ seeded: 2 });
  return true;
}

async function populateDemoDatabase(env: SeedEnv, credentials: DemoCredentials) {
  const db = drizzle(env.TABLECAST_DB);
  const auth = createAuth({ ...env, TABLECAST_EMAIL_FROM: undefined }, undefined, db);
  // 以前のローカルemulate連携だけを統合し、実Googleの識別子は変更しない。
  const mockAccounts = await db
    .select({
      id: identity.account.id,
      issuer: identity.account.issuer,
      user_id: identity.account.userId,
      email: identity.user.email,
    })
    .from(identity.account)
    .innerJoin(identity.user, eq(identity.user.id, identity.account.userId))
    .where(eq(identity.account.providerId, "google"))
    .orderBy(desc(identity.account.createdAt));
  const mockUsers = new Set<string>();
  const repairs: BatchItem<"sqlite">[] = [];
  const canonical: BatchItem<"sqlite">[] = [];
  for (const account of mockAccounts) {
    if (!URL.canParse(account.issuer)) continue;
    const issuer = new URL(account.issuer);
    if (
      account.issuer !== tablecastGoogleMockIssuer &&
      !(
        issuer.protocol === "http:" &&
        ["127.0.0.1", "localhost", "tablecast-emulate"].includes(issuer.hostname)
      )
    )
      continue;
    if (mockUsers.has(account.user_id))
      repairs.push(db.delete(identity.account).where(eq(identity.account.id, account.id)));
    else {
      mockUsers.add(account.user_id);
      canonical.push(
        db
          .update(identity.account)
          .set({ issuer: tablecastGoogleMockIssuer, accountId: account.email.toLowerCase() })
          .where(eq(identity.account.id, account.id)),
      );
    }
  }
  const [firstRepair, ...remainingRepairs] = [...repairs, ...canonical];
  if (firstRepair) await db.batch([firstRepair, ...remainingRepairs]);
  const owners: string[] = [];
  for (const [email, password, name] of [
    [credentials.email, credentials.password, "佐藤 晴香"],
    [credentials.otherEmail, credentials.otherPassword, "山本 翼"],
  ]) {
    if (!email || !password || !name) throw new Error("デモ認証情報が不正です。");
    const existing = await db
      .select({ id: identity.user.id })
      .from(identity.user)
      .where(eq(identity.user.email, email))
      .get();
    const user = existing ?? (await auth.api.signUpEmail({ body: { email, password, name } })).user;
    await db
      .update(identity.user)
      .set({
        emailVerified: true,
        image: sql`coalesce(${identity.user.image},${await seedIdentityIcon(env, "user", user.id)})`,
      })
      .where(eq(identity.user.id, user.id));
    owners.push(user.id);
  }
  faker.seed(20260909);
  const staff = [
    {
      email: "tablecast-owner@example.test",
      name: "佐藤 晴香",
      role: "admin",
      store: "tablecast-komorebi",
    },
    {
      email: "tablecast-member@example.test",
      name: "田中 蓮",
      role: "member",
      store: "tablecast-komorebi",
    },
    {
      email: "tablecast-akari@example.test",
      name: "小林 直子",
      role: "member",
      store: "tablecast-akari",
    },
    {
      email: "tablecast-koharu@example.test",
      name: "山本 翼",
      role: "admin",
      store: "tablecast-koharu",
    },
  ];
  const staffInserts: BatchItem<"sqlite">[] = [];
  for (const store of demoStores(credentials.profile)) {
    for (let index = 0; index < 12; index++) {
      const email = `tablecast-${store.id}-member-${index + 1}@example.test`;
      const name = faker.person.fullName();
      const userId = `tablecast-seed-user-${store.id}-${index + 1}`;
      const createdAt = credentials.baseTime - (index + 1) * 86400000;
      staffInserts.push(
        db
          .insert(identity.user)
          .values({
            id: userId,
            name,
            email,
            emailVerified: true,
            createdAt: new Date(createdAt),
            updatedAt: new Date(createdAt),
            locale: "ja",
          })
          .onConflictDoNothing({ target: identity.user.email }),
      );
      staff.push({ email, name, role: index === 0 ? "admin" : "member", store: store.id });
    }
  }
  const [firstStaff, ...remainingStaff] = staffInserts;
  if (firstStaff) await db.batch([firstStaff, ...remainingStaff]);
  const existingStaff = await db
    .select({ id: identity.user.id, email: identity.user.email })
    .from(identity.user)
    .where(
      inArray(
        identity.user.email,
        staff.map((person) => person.email),
      ),
    );
  const staffIds = new Map(existingStaff.map((person) => [person.email, person.id]));
  const staffUpdates: BatchItem<"sqlite">[] = [];
  for (const person of staff) {
    const existingId = staffIds.get(person.email);
    const user =
      (existingId ? { id: existingId } : undefined) ??
      (
        await auth.api.signUpEmail({
          body: { email: person.email, name: person.name, password: crypto.randomUUID() },
        })
      ).user;
    staffUpdates.push(
      db
        .update(identity.user)
        .set({
          emailVerified: true,
          image: sql`coalesce(${identity.user.image},${await seedIdentityIcon(env, "user", user.id)})`,
        })
        .where(eq(identity.user.id, user.id)),
    );
    staffIds.set(person.email, user.id);
  }
  const [firstUpdate, ...remainingUpdates] = staffUpdates;
  if (firstUpdate) await db.batch([firstUpdate, ...remainingUpdates]);
  for (const initialStore of demoStores(credentials.profile)) {
    const store: Store = initialStore;
    const errors = configurationErrors(store.configuration);
    if (errors.length) throw new Error(JSON.stringify(errors));
    const userId = owners[store.id === "tablecast-koharu" ? 1 : 0];
    if (!userId) throw new Error("店舗の管理者がありません。");
    const currentOrg = await db
      .select({ id: identity.organization.id })
      .from(identity.organization)
      .innerJoin(business.stores, eq(business.stores.organization_id, identity.organization.id))
      .where(eq(business.stores.id, store.id))
      .get();
    const organization =
      currentOrg ??
      (await auth.api.createOrganization({
        body: { name: store.name, slug: `tablecast-store-${store.id}`, userId },
      }));
    if (!organization) throw new Error("デモ店舗を作成できませんでした。");
    await db
      .update(identity.organization)
      .set({
        logo: sql`coalesce(${identity.organization.logo},${await seedIdentityIcon(env, "store", store.id)})`,
      })
      .where(eq(identity.organization.id, organization.id));
    const owner: Owner = { id: organization.id, userId };
    const existing = await db
      .select()
      .from(business.stores)
      .where(eq(business.stores.id, store.id))
      .get();
    if (existing) {
      store.configuration = configurationSchema.parse(JSON.parse(existing.config_json));
      store.configVersion = existing.config_version;
    }
    const existingMembers = await db
      .select({ userId: identity.member.userId })
      .from(identity.member)
      .where(eq(identity.member.organizationId, owner.id));
    const memberIds = new Set(existingMembers.map((member) => member.userId));
    const memberships: BatchItem<"sqlite">[] = [];
    for (const person of staff.filter((candidate) => candidate.store === store.id)) {
      const staffUserId = staffIds.get(person.email);
      if (!staffUserId) throw new Error("デモスタッフがありません。");
      memberships.push(
        db
          .update(identity.session)
          .set({ activeOrganizationId: owner.id })
          .where(
            and(
              eq(identity.session.userId, staffUserId),
              isNull(identity.session.activeOrganizationId),
            ),
          ),
      );
      if (!memberIds.has(staffUserId))
        memberships.push(
          db.insert(identity.member).values({
            id: `tablecast-member-${store.id}-${staffUserId}`,
            organizationId: owner.id,
            userId: staffUserId,
            role: person.role,
            createdAt: new Date(credentials.baseTime),
          }),
        );
    }
    const [firstMember, ...remainingMembers] = memberships;
    if (firstMember) await db.batch([firstMember, ...remainingMembers]);
    if (!existing)
      await db.batch([
        db.insert(business.stores).values({
          id: store.id,
          organization_id: owner.id,
          name: store.name,
          config_json: JSON.stringify(store.configuration),
          updated_at: credentials.baseTime,
        }),
        db.insert(business.configReleases).values({
          store_id: store.id,
          version: 1,
          config_json: JSON.stringify(store.configuration),
          published_by: owner.userId,
          created_at: credentials.baseTime,
        }),
      ]);
    const tables = Array.from({ length: store.tableCount }, (_, index) => {
      const name = `T${(index + 1).toString().padStart(2, "0")}`;
      return { id: `${store.id}-table-${name.slice(1)}`, store_id: store.id, name };
    });
    await db
      .insert(business.restaurantTables)
      .values(tables)
      .onConflictDoNothing({ target: business.restaurantTables.id });
    if (credentials.profile === "history") await seedHistory(db, store, owner);
    await seedCurrentTables(db, store, owner, credentials.baseTime);
  }
  const violations = await db.all(sql`PRAGMA foreign_key_check`);
  if (violations.length) throw new Error("デモデータの外部キーが不整合です。");
  const [stores, tables, historicalSessions, orders, events] = await db.batch([
    db.select({ count: count() }).from(business.stores),
    db.select({ count: count() }).from(business.restaurantTables),
    db
      .select({ count: count() })
      .from(business.tableSessions)
      .where(like(business.tableSessions.id, "%-history-%")),
    db.select({ count: count() }).from(business.orders),
    db.select({ count: count() }).from(business.tableEvents),
  ]);
  return {
    stores: stores[0]?.count ?? 0,
    tables: tables[0]?.count ?? 0,
    historicalSessions: historicalSessions[0]?.count ?? 0,
    orders: orders[0]?.count ?? 0,
    events: events[0]?.count ?? 0,
  };
}
