import type { BatchItem } from "drizzle-orm/batch";
import { tablecastGoogleMockIssuer } from "@tablecast/api/bootstrap";
import { business, createDatabase, identity } from "@tablecast/api/db";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { DemoCredentials } from "../tablecast-seed.ts";
import type { SeedEnv } from "./types.ts";
import {
  tablecastDemoEmail,
  tablecastDemoIdentities,
  tablecastDemoLinkIdentity,
  tablecastDemoStoreIcons,
} from "../../apps/emulate/src/tablecast-demo-identities.ts";
import { legacyIdentityIconUrl, seedIdentityIcon } from "../tablecast-seed-icons.ts";

export function normaliseDemoCredentials(credentials: DemoCredentials) {
  const normalised = {
    ...credentials,
    email: tablecastDemoEmail(credentials.email),
    otherEmail: tablecastDemoEmail(credentials.otherEmail),
  };
  const staff = demoStaff(normalised);
  const emails = staff.map((person) => person.email.toLowerCase());
  if (new Set(emails).size !== emails.length || emails.includes(tablecastDemoLinkIdentity.email))
    throw new Error("独自オーナーメールがデモ人物と重複しています。");
  return normalised;
}

export async function migrateDemoIdentityEmails(env: SeedEnv) {
  const people = [...tablecastDemoIdentities, tablecastDemoLinkIdentity];
  const db = createDatabase(env.TABLECAST_DB);
  const users = await db
    .select({ id: identity.user.id, email: identity.user.email })
    .from(identity.user)
    .where(
      inArray(
        identity.user.email,
        people.flatMap((person) => [person.email, ...person.legacyEmails]),
      ),
    );
  const updates: BatchItem<"sqlite">[] = [];
  for (const person of people) {
    const previous = users.filter((user) =>
      person.legacyEmails.some((email) => email === user.email),
    );
    if (!previous.length) continue;
    if (previous.length > 1 || users.some((user) => user.email === person.email))
      throw new Error(`デモメールの移行先が既存ユーザーと重複しています: ${person.email}`);
    const user = previous[0];
    if (!user) continue;
    // 旧こもれびの一般スタッフを新デモの管理者へ移行する。通常の権限変更は保持する。
    if (user.email === "tablecast-member@example.test")
      updates.push(
        db
          .update(identity.member)
          .set({ role: "admin" })
          .where(
            and(
              eq(identity.member.userId, user.id),
              eq(identity.member.role, "member"),
              inArray(
                identity.member.organizationId,
                db
                  .select({ id: business.stores.organization_id })
                  .from(business.stores)
                  .where(eq(business.stores.id, "tablecast-komorebi")),
              ),
            ),
          ),
      );
    updates.push(
      db
        .update(identity.user)
        .set({ email: person.email })
        .where(and(eq(identity.user.id, user.id), eq(identity.user.email, user.email))),
      db
        .update(identity.account)
        .set({ accountId: person.email })
        .where(
          and(
            eq(identity.account.userId, user.id),
            eq(identity.account.providerId, "google"),
            eq(identity.account.issuer, tablecastGoogleMockIssuer),
            eq(identity.account.accountId, user.email),
          ),
        ),
    );
  }
  // ユーザーID・資格情報を保ち、旧デモのメール・subject・既知の役割を同時に移行する。
  const [first, ...rest] = updates;
  if (first) await db.batch([first, ...rest]);
}

export function demoStaff(credentials: DemoCredentials) {
  return tablecastDemoIdentities.flatMap((person) => {
    const email =
      person.role === "owner"
        ? person.stores.some((storeId) => storeId === "tablecast-koharu")
          ? credentials.otherEmail
          : credentials.email
        : person.email;
    // 独自メールは追加の所有者として保持し、Google名簿の所有者も必ず投入する。
    return email === person.email ? [person] : [person, { ...person, email }];
  });
}

export async function refreshDemoIdentityIcons(env: SeedEnv, credentials: DemoCredentials) {
  const staff = [...demoStaff(credentials), tablecastDemoLinkIdentity];
  const db = createDatabase(env.TABLECAST_DB);
  const [users, organisations] = await db.batch([
    db
      .select({ id: identity.user.id, email: identity.user.email })
      .from(identity.user)
      .where(
        inArray(
          identity.user.email,
          staff.map((person) => person.email),
        ),
      ),
    db
      .select({
        id: identity.organization.id,
        storeId: sql<string>`${business.stores.id}`.as("store_id"),
      })
      .from(identity.organization)
      .innerJoin(business.stores, eq(business.stores.organization_id, identity.organization.id))
      .where(inArray(business.stores.id, Object.keys(tablecastDemoStoreIcons))),
  ]);
  const updates: BatchItem<"sqlite">[] = [];
  for (const user of users) {
    const person = staff.find((candidate) => candidate.email === user.email);
    if (!person) continue;
    const image = await seedIdentityIcon(env, person.imageFile);
    updates.push(
      db
        .update(identity.user)
        .set({ image })
        .where(
          and(
            eq(identity.user.id, user.id),
            or(
              isNull(identity.user.image),
              eq(identity.user.image, legacyIdentityIconUrl("user", user.id)),
            ),
          ),
        ),
    );
  }
  for (const organisation of organisations) {
    const file = tablecastDemoStoreIcons[organisation.storeId];
    if (!file) continue;
    const logo = await seedIdentityIcon(env, file);
    updates.push(
      db
        .update(identity.organization)
        .set({ logo })
        .where(
          and(
            eq(identity.organization.id, organisation.id),
            or(
              isNull(identity.organization.logo),
              inArray(identity.organization.logo, [
                legacyIdentityIconUrl("store", organisation.storeId),
                ...(organisation.storeId === "tablecast-hanul"
                  ? [legacyIdentityIconUrl("store", "tablecast-akari")]
                  : []),
              ]),
            ),
          ),
        ),
    );
  }
  // 更新時点でも旧seedのURLかを判定し、並行した手動変更を保つ。
  const [first, ...rest] = updates;
  if (first) await db.batch([first, ...rest]);
}
