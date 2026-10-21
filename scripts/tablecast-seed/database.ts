import { isHostedEmulator } from "@tablecast/api/bootstrap";
import { business, createDatabase, identity } from "@tablecast/api/db";
import { sql } from "drizzle-orm";
import type { TablecastSeedTemplate } from "../tablecast-seed-template.ts";
import type { DemoCredentials } from "../tablecast-seed.ts";
import type { SeedEnv } from "./types.ts";
import { demoStores } from "../tablecast-fixtures.ts";
import { seedMenuImages } from "../tablecast-seed-media.ts";
import {
  migrateDemoIdentityEmails,
  normaliseDemoCredentials,
  refreshDemoIdentityIcons,
} from "./identities.ts";
import { populateDemoDatabase } from "./populate.ts";
import { populateSeedTemplate } from "./template.ts";

export async function seedDemoDatabase(env: SeedEnv, credentials: DemoCredentials) {
  if (env.TABLECAST_ENV !== "development") throw new Error("seedは開発環境に限定されています。");
  return populateDemoDatabase(env, normaliseDemoCredentials(credentials));
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
    if (env.TABLECAST_ENV === "staging") return false;
    // 再配備で追加された内容アドレス付き画像も補い、既存の営業データは再投入しない。
    await seedMenuImages(
      env.TABLECAST_MEDIA,
      false,
      demoStores(credentials.profile).map((store) => store.configuration),
    );
    await migrateDemoIdentityEmails(env);
    await refreshDemoIdentityIcons(env, credentials);
    return false;
  }
  // 2はDB投入済み・画像待ち。営業データを再投入せず画像だけを再開する。
  if (owner.seeded === 2) {
    await seedMenuImages(env.TABLECAST_MEDIA, true);
    await migrateDemoIdentityEmails(env);
    await refreshDemoIdentityIcons(env, credentials);
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
  return true;
}
