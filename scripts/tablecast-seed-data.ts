import {
  configurationErrors,
  createAuth,
  isHostedEmulator,
  tablecastGoogleMockIssuer,
} from "@tablecast/api/bootstrap";
import { business, createDatabase, type Database, identity } from "@tablecast/api/db";
import { migrateImageAssets } from "@tablecast/api/media-migration";
import { readConfiguration } from "@tablecast/api/schema";
import { and, count, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { type BatchItem } from "drizzle-orm/batch";
import { tablecastDemoStoreIcons } from "../apps/emulate/src/tablecast-demo-identities.ts";
import { demoStores } from "./tablecast-fixtures.ts";
import { seedIdentityIcon } from "./tablecast-seed-icons.ts";
import { seedMenuImages } from "./tablecast-seed-media.ts";
import { type TablecastSeedTemplate } from "./tablecast-seed-template.ts";
import { type DemoCredentials } from "./tablecast-seed.ts";
import { seedPluginAnalytics } from "./tablecast-seed/analytics.ts";
import { rebuildSeedConfigurations } from "./tablecast-seed/configuration.ts";
import {
  demoStaff,
  migrateDemoIdentityEmails,
  normaliseDemoCredentials,
  refreshDemoIdentityIcons,
} from "./tablecast-seed/identities.ts";
import { seedPluginRewards } from "./tablecast-seed/rewards.ts";
import { seedCurrentTables, seedHistory } from "./tablecast-seed/session.ts";

export { sampleLine, tablecastHistoryBaseTime } from "./tablecast-seed/session.ts";

export type Store = ReturnType<typeof demoStores>[number] & { configVersion?: number };

export type Owner = { id: string; userId: string };

export type SeedDatabase = Pick<Database, "all" | "batch" | "insert" | "select" | "update">;

export type SeedEvent = {
  at: number;
  data: string;
  kind: string;
  sessionId: string;
  storeId: string;
};

export type SeedEnv = Pick<
  TablecastEnv,
  | "TABLECAST_AUTH_SECRET"
  | "TABLECAST_DB"
  | "TABLECAST_ENV"
  | "TABLECAST_IMAGES"
  | "TABLECAST_MEDIA"
  | "TABLECAST_PUBLIC_ORIGIN"
>;

async function seedCounts(db: Database) {
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

async function populateDemoDatabase(env: SeedEnv, credentials: DemoCredentials) {
  await seedMenuImages(
    env.TABLECAST_MEDIA,
    false,
    demoStores(credentials.profile).map((store) => store.configuration),
  );
  await migrateDemoIdentityEmails(env);
  const db = createDatabase(env.TABLECAST_DB);
  const auth = createAuth({ ...env, TABLECAST_EMAIL_FROM: undefined }, undefined, db);
  const authContext = await auth.$context;
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
    if (!account.issuer || !URL.canParse(account.issuer)) continue;
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
  const staff = demoStaff(credentials);
  const owners: string[] = [];
  for (const email of [credentials.email, credentials.otherEmail]) {
    const person = staff.find((candidate) => candidate.email === email);
    if (!email || !person) throw new Error("デモ認証情報が不正です。");
    const existing = await db
      .select({ id: identity.user.id })
      .from(identity.user)
      .where(eq(identity.user.email, email))
      .get();
    const user =
      existing ??
      (await authContext.internalAdapter.createUser(
        { email, name: person.name, emailVerified: true },
        { method: "admin" },
      ));
    owners.push(user.id);
  }
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
      (await authContext.internalAdapter.createUser(
        { email: person.email, name: person.name, emailVerified: true },
        { method: "admin" },
      ));
    staffUpdates.push(
      db
        .update(identity.user)
        .set({
          emailVerified: true,
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
    const owner: Owner = { id: organization.id, userId };
    await db
      .insert(business.organizationAi)
      .values({ organizationId: organization.id, updatedAt: credentials.baseTime })
      .onConflictDoNothing();
    const existing = await db
      .select()
      .from(business.stores)
      .where(eq(business.stores.id, store.id))
      .get();
    if (existing) {
      store.configuration = readConfiguration(JSON.parse(existing.config_json));
      store.configVersion = existing.config_version;
    }
    const existingMembers = await db
      .select({ userId: identity.member.userId })
      .from(identity.member)
      .where(eq(identity.member.organizationId, owner.id));
    const memberIds = new Set(existingMembers.map((member) => member.userId));
    const memberships: BatchItem<"sqlite">[] = [];
    for (const person of staff.filter((candidate) =>
      candidate.stores.some((storeId) => storeId === store.id),
    )) {
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
    if (credentials.profile !== "smoke") {
      await seedPluginAnalytics(db, store, owner);
      await seedPluginRewards(db, store, owner);
    }
  }
  await refreshDemoIdentityIcons(env, credentials);
  return seedCounts(db);
}

async function populateSeedTemplate(
  env: SeedEnv,
  credentials: DemoCredentials,
  template: TablecastSeedTemplate,
) {
  const { stores, staff } = template.payload;
  const ownerEmails = staff
    .filter((person) => person.role === "owner")
    .map((person) => person.email);
  if (
    credentials.profile !== "demo" ||
    !ownerEmails.includes(credentials.email) ||
    !ownerEmails.includes(credentials.otherEmail)
  )
    throw new Error("固定seedは標準デモの初回投入に限ります。");
  const db = createDatabase(env.TABLECAST_DB);
  const at = new Date(credentials.baseTime);
  const users = staff.map((person) => ({ ...person, id: `tablecast-seed-user-${person.email}` }));
  // 画像の失敗時はDBを変更しない。内容アドレス付きの同じ画像は再利用できる。
  await seedMenuImages(
    env.TABLECAST_MEDIA,
    false,
    stores.map((store) => store.configuration),
  );
  const images = new Map<string, string>();
  const files = [
    ...new Set([
      ...staff.map((person) => person.imageFile),
      ...Object.values(tablecastDemoStoreIcons),
    ]),
  ];
  for (let offset = 0; offset < files.length; offset += 4) {
    const results = await Promise.allSettled(
      files.slice(offset, offset + 4).map(async (file) => {
        images.set(file, await seedIdentityIcon(env, file));
      }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  const queries: BatchItem<"sqlite">[] = [
    db.insert(identity.user).values(
      users.map((person) => ({
        id: person.id,
        email: person.email,
        name: person.name,
        emailVerified: true,
        image: images.get(person.imageFile),
        createdAt: at,
        updatedAt: at,
      })),
    ),
    db.insert(identity.organization).values(
      stores.map((store) => ({
        id: `tablecast-seed-organization-${store.id}`,
        name: store.name,
        slug: `tablecast-store-${store.id}`,
        logo: images.get(tablecastDemoStoreIcons[store.id] ?? ""),
        createdAt: at,
      })),
    ),
  ];
  for (const store of stores) {
    const organizationId = `tablecast-seed-organization-${store.id}`;
    const members = users.filter((person) => person.stores.includes(store.id));
    const owner = members.find((person) => person.role === "owner");
    if (!owner) throw new Error("店舗の管理者がありません。");
    queries.push(
      db
        .insert(business.organizationAi)
        .values({ organizationId, updatedAt: credentials.baseTime })
        .onConflictDoNothing(),
      db.insert(identity.member).values(
        members.map((person) => ({
          id: `tablecast-member-${store.id}-${person.id}`,
          organizationId,
          userId: person.id,
          role: person.role,
          createdAt: at,
        })),
      ),
      db.insert(business.stores).values({
        id: store.id,
        organization_id: organizationId,
        name: store.name,
        config_json: JSON.stringify(store.configuration),
        updated_at: credentials.baseTime,
      }),
      db.insert(business.configReleases).values({
        store_id: store.id,
        version: 1,
        config_json: JSON.stringify(store.configuration),
        published_by: owner.id,
        created_at: credentials.baseTime,
      }),
    );
    // 3列×24行以内とし、D1の100 bind制限を守る。
    const tables = Array.from({ length: store.tableCount }, (_, index) => ({
      id: `${store.id}-table-${(index + 1).toString().padStart(2, "0")}`,
      store_id: store.id,
      name: `T${(index + 1).toString().padStart(2, "0")}`,
    }));
    for (let offset = 0; offset < tables.length; offset += 24)
      queries.push(db.insert(business.restaurantTables).values(tables.slice(offset, offset + 24)));
  }
  const [first, ...rest] = queries;
  if (!first) throw new Error("固定seedが空です。");
  console.time("固定seedのDrizzle batch");
  try {
    // 親子行を1回の往復で原子的に投入し、途中状態を残さない。
    await db.batch([first, ...rest]);
  } finally {
    console.timeEnd("固定seedのDrizzle batch");
  }
  console.time("営業中の卓のseed");
  try {
    for (const store of stores) {
      const owner = users.find(
        (person) => person.role === "owner" && person.stores.includes(store.id),
      );
      if (!owner) throw new Error("店舗の管理者がありません。");
      await seedCurrentTables(
        db,
        store,
        { id: `tablecast-seed-organization-${store.id}`, userId: owner.id },
        credentials.baseTime,
      );
      const publisher = { id: `tablecast-seed-organization-${store.id}`, userId: owner.id };
      await seedPluginAnalytics(db, store, publisher);
      await seedPluginRewards(db, store, publisher);
    }
  } finally {
    console.timeEnd("営業中の卓のseed");
  }
  return seedCounts(db);
}

export async function seedDemoDatabase(
  env: SeedEnv,
  credentials: DemoCredentials,
  options: { rebuildConfiguration?: boolean } = {},
) {
  if (env.TABLECAST_ENV !== "development") throw new Error("seedは開発環境に限定されています。");
  if (options.rebuildConfiguration)
    await rebuildSeedConfigurations(env, normaliseDemoCredentials(credentials));
  const counts = await populateDemoDatabase(env, normaliseDemoCredentials(credentials));
  await migrateImageAssets(env);
  return counts;
}

export async function seedPreviewDatabase(
  env: SeedEnv,
  credentials: DemoCredentials,
  template?: TablecastSeedTemplate,
) {
  credentials = normaliseDemoCredentials(credentials);
  if (!isHostedEmulator(env)) throw new Error("検証環境の初期投入対象が不正です。");
  const db = createDatabase(env.TABLECAST_DB);
  const owner = await db.select().from(business.deploymentOwner).get();
  if (
    owner?.repository !== "kit-codex-hack-fes-2026/tablecast-poc" ||
    `${owner.environment}.kit-codex.workers.dev` !== new URL(env.TABLECAST_PUBLIC_ORIGIN).hostname
  )
    throw new Error("PR初期投入の所有情報が一致しません。");
  if (owner.seeded === 1) {
    if (env.TABLECAST_ENV === "staging") {
      await migrateImageAssets(env);
      return false;
    }
    // 再配備で追加された内容アドレス付き画像も補い、既存の営業データは再投入しない。
    await seedMenuImages(
      env.TABLECAST_MEDIA,
      false,
      demoStores(credentials.profile).map((store) => store.configuration),
    );
    await migrateDemoIdentityEmails(env);
    await refreshDemoIdentityIcons(env, credentials);
    await migrateImageAssets(env);
    return false;
  }
  // 2はDB投入済み・画像待ち。営業データを再投入せず画像だけを再開する。
  if (owner.seeded === 2) {
    await seedMenuImages(env.TABLECAST_MEDIA, true);
    await migrateDemoIdentityEmails(env);
    await refreshDemoIdentityIcons(env, credentials);
    await migrateImageAssets(env);
    return true;
  }
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
  if (template && owner.seeded === 0) await populateSeedTemplate(env, credentials, template);
  else await populateDemoDatabase(env, credentials);
  await db.update(business.deploymentOwner).set({ seeded: 2 });
  await migrateImageAssets(env);
  return true;
}
