import type { BatchItem } from "drizzle-orm/batch";
import { createAuth, tablecastCredentialIssuer } from "@tablecast/api/bootstrap";
import { business, createDatabase, identity } from "@tablecast/api/db";
import type { TablecastSeedTemplate } from "../tablecast-seed-template.ts";
import type { DemoCredentials } from "../tablecast-seed.ts";
import type { SeedEnv } from "./types.ts";
import { tablecastDemoStoreIcons } from "../../apps/emulate/src/tablecast-demo-identities.ts";
import { seedIdentityIcon } from "../tablecast-seed-icons.ts";
import { seedMenuImages } from "../tablecast-seed-media.ts";
import { seedCounts } from "./counts.ts";
import { seedCurrentTables } from "./current-tables.ts";

export async function populateSeedTemplate(
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
  const auth = await createAuth({ ...env, TABLECAST_EMAIL_FROM: undefined }, undefined, db)
    .$context;
  const at = new Date(credentials.baseTime);
  // 資格情報と時刻は成果物に保存せず、現行の認証設定で毎回生成する。
  const users = await Promise.all(
    staff.map(async (person) => ({
      ...person,
      id: `tablecast-seed-user-${person.email}`,
      password: await auth.password.hash(
        person.email === credentials.email
          ? credentials.password
          : person.email === credentials.otherEmail
            ? credentials.otherPassword
            : crypto.randomUUID(),
      ),
    })),
  );
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
    db.insert(identity.account).values(
      users.map((person) => ({
        id: `tablecast-seed-credential-${person.id}`,
        userId: person.id,
        accountId: person.id,
        providerId: "credential",
        issuer: tablecastCredentialIssuer,
        password: person.password,
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
    }
  } finally {
    console.timeEnd("営業中の卓のseed");
  }
  return seedCounts(db);
}
