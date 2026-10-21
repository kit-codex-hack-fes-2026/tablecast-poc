import type { BatchItem } from "drizzle-orm/batch";
import {
  configurationErrors,
  createAuth,
  tablecastGoogleMockIssuer,
} from "@tablecast/api/bootstrap";
import { business, createDatabase, identity } from "@tablecast/api/db";
import { configurationSchema } from "@tablecast/api/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DemoCredentials } from "../tablecast-seed.ts";
import type { Owner, SeedEnv, Store } from "./types.ts";
import { demoStores } from "../tablecast-fixtures.ts";
import { seedMenuImages } from "../tablecast-seed-media.ts";
import { seedCounts } from "./counts.ts";
import { seedCurrentTables } from "./current-tables.ts";
import { seedHistory } from "./history.ts";
import { demoStaff, migrateDemoIdentityEmails, refreshDemoIdentityIcons } from "./identities.ts";

export async function populateDemoDatabase(env: SeedEnv, credentials: DemoCredentials) {
  await seedMenuImages(
    env.TABLECAST_MEDIA,
    false,
    demoStores(credentials.profile).map((store) => store.configuration),
  );
  await migrateDemoIdentityEmails(env);
  const db = createDatabase(env.TABLECAST_DB);
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
  for (const [email, password] of [
    [credentials.email, credentials.password],
    [credentials.otherEmail, credentials.otherPassword],
  ]) {
    const person = staff.find((candidate) => candidate.email === email);
    if (!email || !password || !person) throw new Error("デモ認証情報が不正です。");
    const existing = await db
      .select({ id: identity.user.id })
      .from(identity.user)
      .where(eq(identity.user.email, email))
      .get();
    const user =
      existing ??
      (await auth.api.signUpEmail({ body: { email, password, name: person.name } })).user;
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
      store.configuration = configurationSchema.parse(JSON.parse(existing.config_json));
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
  }
  await refreshDemoIdentityIcons(env, credentials);
  return seedCounts(db);
}
