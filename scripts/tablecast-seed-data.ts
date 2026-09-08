import { seedIdentityIcon } from "./tablecast-seed-icons";
import { fakerJA as faker } from "@faker-js/faker";
import { createAuth, tablecastGoogleMockIssuer } from "../apps/api/src/auth";
import { configurationErrors, confirmationText, priceCart } from "../apps/api/src/modules/pricing";
import type { PlanContext } from "../apps/api/src/modules/pricing";
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
async function insertSession(db: D1Database, statements: (D1PreparedStatement | SeedEvent)[]) {
  const queries: D1PreparedStatement[] = [];
  const events: SeedEvent[] = [];
  for (const statement of statements) {
    if ("kind" in statement) events.push(statement);
    else queries.push(statement);
  }
  // D1の一statement当たり100個のbind上限を超えず、proxy往復もまとめる。
  for (let offset = 0; offset < events.length; offset += 20) {
    const chunk = events.slice(offset, offset + 20);
    queries.push(
      db
        .prepare(
          `INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES ${chunk.map(() => "(?,?,?,?,?)").join(",")}`,
        )
        .bind(
          ...chunk.flatMap((item) => [item.storeId, item.sessionId, item.kind, item.data, item.at]),
        ),
    );
  }
  await db.batch(queries);
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

function confirmation(db: D1Database, storeId: string, snapshot: Snapshot, at: number) {
  return db
    .prepare(
      "INSERT INTO confirmations(id,store_id,table_session_id,cart_version,config_version,channel,status,snapshot_json,expires_at,created_at) VALUES(?,?,?,?,?,'gui',?,?,?,?)",
    )
    .bind(
      snapshot.id,
      storeId,
      snapshot.tableSessionId,
      snapshot.cartVersion,
      snapshot.configVersion,
      snapshot.status,
      JSON.stringify(snapshot),
      snapshot.expiresAt,
      at,
    );
}

function order(
  db: D1Database,
  storeId: string,
  snapshot: Snapshot,
  status: "submitted" | "accepted" | "served",
  at: number,
) {
  return db
    .prepare(
      "INSERT INTO orders(id,store_id,table_session_id,snapshot_id,idempotency_key,status,snapshot_json,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      `${snapshot.id}-order`,
      storeId,
      snapshot.tableSessionId,
      snapshot.id,
      `${snapshot.id}-submit`,
      status,
      JSON.stringify(snapshot),
      snapshot.total,
      at,
      status === "submitted" ? at : at + (status === "accepted" ? 3000 : 10_000),
    );
}

function payment(
  db: D1Database,
  storeId: string,
  sessionId: string,
  userId: string,
  amount: number,
  at: number,
) {
  return db
    .prepare(
      "INSERT INTO payments(id,store_id,table_session_id,idempotency_key,kind,amount,reason,actor_id,created_at) VALUES(?,?,?,?,'payment',?,?,?,?)",
    )
    .bind(
      `${sessionId}-payment`,
      storeId,
      sessionId,
      `${sessionId}-payment`,
      amount,
      "合成デモの模擬支払",
      userId,
      at,
    );
}

async function seedHistory(db: D1Database, store: Store, owner: Owner) {
  const previous = await db
    .prepare("SELECT id FROM table_sessions WHERE store_id=? AND id LIKE '%-history-%'")
    .bind(store.id)
    .all<{ id: string }>();
  const existing = new Set(previous.results.map((session) => session.id));
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
    const statements = [
      db
        .prepare(
          "INSERT INTO table_sessions(id,store_id,table_id,locale,status,guest_count,cart_version,opened_at,closed_at) VALUES(?,?,?,?,'closed',?,18,?,?)",
        )
        .bind(sessionId, store.id, tableId, locale, guestCount, openedAt, closedAt),
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

async function seedCurrentTables(db: D1Database, store: Store, owner: Owner, baseTime: number) {
  for (let number = 1; number <= store.tableCount; number++) {
    const tableId = `${store.id}-table-${number.toString().padStart(2, "0")}`;
    const sessionId = `${tableId}-session`;
    const state = number % 12;
    if (
      state === 10 ||
      (await db
        .prepare("SELECT id FROM table_sessions WHERE id=? OR (table_id=? AND status='open')")
        .bind(sessionId, tableId)
        .first())
    )
      continue;
    const at = baseTime - number * 3 * 60_000;
    const locale = number % 3 === 0 ? "en" : "ja";
    const guestCount = 2 + (number % 3);
    const rule = state === 6 ? store.configuration.plans[0] : null;
    const plan = rule ? { id: rule.id, startedAt: at, rules: rule } : null;
    const lines = state === 2 || state === 3 ? [sampleLine(store.configuration)] : [];
    const closed = state === 11;
    const statements = [
      db
        .prepare(
          "INSERT INTO table_sessions(id,store_id,table_id,locale,status,guest_count,cart_version,cart_json,voice_state,staff_called,plan_json,opened_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          sessionId,
          store.id,
          tableId,
          locale,
          closed ? "closed" : "open",
          guestCount,
          lines.length ? 1 : closed ? 6 : state >= 4 && state <= 7 ? state - 2 : 0,
          JSON.stringify(lines),
          state === 9 ? "error" : "stopped",
          state === 8 ? 1 : 0,
          plan ? JSON.stringify(plan) : null,
          at,
          closed ? at + 60_000 : null,
        ),
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

export async function seedDemoDatabase(env: TablecastEnv, credentials: DemoCredentials) {
  if (env.TABLECAST_ENV !== "development") throw new Error("seedは開発環境に限定されています。");
  const db = env.TABLECAST_DB;
  const auth = createAuth({ ...env, TABLECAST_EMAIL_FROM: undefined });
  // 以前のローカルemulate連携だけを統合し、実Googleの識別子は変更しない。
  const mockAccounts = await db
    .prepare(
      "SELECT account.id, account.issuer, account.user_id, user.email FROM account JOIN user ON user.id=account.user_id WHERE provider_id='google' ORDER BY account.created_at DESC",
    )
    .all<{ id: string; issuer: string; user_id: string; email: string }>();
  const mockUsers = new Set<string>();
  const repairs: D1PreparedStatement[] = [];
  const canonical: D1PreparedStatement[] = [];
  for (const account of mockAccounts.results) {
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
      repairs.push(db.prepare("DELETE FROM account WHERE id=?").bind(account.id));
    else {
      mockUsers.add(account.user_id);
      canonical.push(
        db
          .prepare("UPDATE account SET issuer=?,account_id=? WHERE id=?")
          .bind(tablecastGoogleMockIssuer, account.email.toLowerCase(), account.id),
      );
    }
  }
  if (canonical.length) await db.batch([...repairs, ...canonical]);
  const owners: string[] = [];
  for (const [email, password, name] of [
    [credentials.email, credentials.password, "佐藤 晴香"],
    [credentials.otherEmail, credentials.otherPassword, "山本 翼"],
  ]) {
    if (!email || !password || !name) throw new Error("デモ認証情報が不正です。");
    const existing = await db
      .prepare("SELECT id FROM user WHERE email=?")
      .bind(email)
      .first<{ id: string }>();
    const user = existing ?? (await auth.api.signUpEmail({ body: { email, password, name } })).user;
    await db
      .prepare("UPDATE user SET email_verified=1,image=COALESCE(image,?) WHERE id=?")
      .bind(await seedIdentityIcon(env, "user", user.id), user.id)
      .run();
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
  for (const store of demoStores(credentials.profile)) {
    for (let index = 0; index < 12; index++) {
      const email = `tablecast-${store.id}-member-${index + 1}@example.test`;
      const name = faker.person.fullName();
      const userId = `tablecast-seed-user-${store.id}-${index + 1}`;
      const createdAt = credentials.baseTime - (index + 1) * 86400000;
      await db
        .prepare(
          "INSERT INTO user(id,name,email,email_verified,created_at,updated_at,locale) VALUES(?,?,?,1,?,?,'ja') ON CONFLICT(email) DO NOTHING",
        )
        .bind(userId, name, email, createdAt, createdAt)
        .run();
      staff.push({ email, name, role: index === 0 ? "admin" : "member", store: store.id });
    }
  }
  const staffIds = new Map<string, string>();
  for (const person of staff) {
    const existing = await db
      .prepare("SELECT id FROM user WHERE email=?")
      .bind(person.email)
      .first<{ id: string }>();
    const user =
      existing ??
      (
        await auth.api.signUpEmail({
          body: { email: person.email, name: person.name, password: crypto.randomUUID() },
        })
      ).user;
    await db
      .prepare("UPDATE user SET email_verified=1,image=COALESCE(image,?) WHERE id=?")
      .bind(await seedIdentityIcon(env, "user", user.id), user.id)
      .run();
    staffIds.set(person.email, user.id);
  }
  for (const initialStore of demoStores(credentials.profile)) {
    const store: Store = initialStore;
    const errors = configurationErrors(store.configuration);
    if (errors.length) throw new Error(JSON.stringify(errors));
    const userId = owners[store.id === "tablecast-koharu" ? 1 : 0];
    if (!userId) throw new Error("店舗の管理者がありません。");
    const currentOrg = await db
      .prepare(
        "SELECT o.id FROM organization o JOIN stores s ON s.organization_id=o.id WHERE s.id=?",
      )
      .bind(store.id)
      .first<{ id: string }>();
    const organization =
      currentOrg ??
      (await auth.api.createOrganization({
        body: { name: store.name, slug: `tablecast-store-${store.id}`, userId },
      }));
    if (!organization) throw new Error("デモ店舗を作成できませんでした。");
    await db
      .prepare("UPDATE organization SET logo=COALESCE(logo,?) WHERE id=?")
      .bind(await seedIdentityIcon(env, "store", store.id), organization.id)
      .run();
    const owner: Owner = { id: organization.id, userId };
    const existing = await db
      .prepare("SELECT id,config_json,config_version FROM stores WHERE id=?")
      .bind(store.id)
      .first<{ id: string; config_json: string; config_version: number }>();
    if (existing) {
      store.configuration = configurationSchema.parse(JSON.parse(existing.config_json));
      store.configVersion = existing.config_version;
    }
    for (const person of staff.filter((candidate) => candidate.store === store.id)) {
      const staffUserId = staffIds.get(person.email);
      if (!staffUserId) throw new Error("デモスタッフがありません。");
      await db.batch([
        db
          .prepare(
            "UPDATE session SET active_organization_id=? WHERE user_id=? AND active_organization_id IS NULL",
          )
          .bind(owner.id, staffUserId),
        db
          .prepare(
            "INSERT INTO member(id,organization_id,user_id,role,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM member WHERE organization_id=? AND user_id=?)",
          )
          .bind(
            `tablecast-member-${store.id}-${staffUserId}`,
            owner.id,
            staffUserId,
            person.role,
            credentials.baseTime,
            owner.id,
            staffUserId,
          ),
      ]);
    }
    if (!existing)
      await db.batch([
        db
          .prepare(
            "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES(?,?,?,?,?)",
          )
          .bind(
            store.id,
            owner.id,
            store.name,
            JSON.stringify(store.configuration),
            credentials.baseTime,
          ),
        db
          .prepare(
            "INSERT INTO config_releases(store_id,version,config_json,published_by,created_at) VALUES(?,1,?,?,?)",
          )
          .bind(store.id, JSON.stringify(store.configuration), owner.userId, credentials.baseTime),
      ]);
    const tables: D1PreparedStatement[] = [];
    for (let number = 1; number <= store.tableCount; number++) {
      const name = `T${number.toString().padStart(2, "0")}`;
      tables.push(
        db
          .prepare(
            "INSERT INTO restaurant_tables(id,store_id,name) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(`${store.id}-table-${name.slice(1)}`, store.id, name),
      );
    }
    await db.batch(tables);
    if (credentials.profile === "history") await seedHistory(db, store, owner);
    await seedCurrentTables(db, store, owner, credentials.baseTime);
  }
  const violations = await db.prepare("PRAGMA foreign_key_check").all();
  if (violations.results.length) throw new Error("デモデータの外部キーが不整合です。");
  return db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM stores) AS stores,(SELECT COUNT(*) FROM restaurant_tables) AS tables,(SELECT COUNT(*) FROM table_sessions WHERE id LIKE '%-history-%') AS historicalSessions,(SELECT COUNT(*) FROM orders) AS orders,(SELECT COUNT(*) FROM table_events) AS events",
    )
    .first();
}
