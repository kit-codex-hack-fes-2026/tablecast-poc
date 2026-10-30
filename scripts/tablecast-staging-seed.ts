import { configurationErrors, isHostedEmulator } from "@tablecast/api/bootstrap";
import { business, createDatabase, identity } from "@tablecast/api/db";
import { type Configuration, configurationSchema } from "@tablecast/api/schema";
import { and, count, eq, inArray, like, sql } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { apiSdkConfiguration } from "../apps/api/cloudflare.config.ts";
import {
  deploymentOptions,
  deploymentTarget,
  tablecastAccountId,
  tablecastAdoptedResources,
  tablecastRepository,
} from "./tablecast-deploy-config.ts";
import { demoStores } from "./tablecast-fixtures.ts";
import { seedPluginAnalytics } from "./tablecast-seed/analytics.ts";
import { seedPluginRewards } from "./tablecast-seed/rewards.ts";

type RefreshEnv = Pick<TablecastEnv, "TABLECAST_DB" | "TABLECAST_ENV" | "TABLECAST_PUBLIC_ORIGIN">;

/** 既存の商品名・価格・販売状態・独自商品・声・店舗設定を保ち、seedの商品情報だけ更新する。 */
function refreshedSeedFood(current: Configuration, seed: Configuration): Configuration {
  return configurationSchema.parse({
    ...current,
    cast: {
      ...current.cast,
      instructions: Object.fromEntries(
        Object.entries(current.cast.instructions).map(([locale, value]) => [
          locale,
          typeof value === "string"
            ? value
                .replace(
                  "宗教認証・ヴィーガン適合・交差接触は未確認です。",
                  "食事対応は選択後の業務APIを確認します。厨房器具は共用で、ハラール認証はありません。",
                )
                .replace(
                  "Religious certification, vegan suitability and cross-contact are unverified.",
                  "Use the business tools for dietary suitability after customisation. Kitchen equipment is shared and the restaurant has no halal certification.",
                )
                .replace(
                  "宗教认证、纯素适用性和交叉接触尚未确认；",
                  "按所选配置查询饮食信息。厨房设备共用，未取得清真认证；",
                )
                .replace(
                  "종교 인증, 비건 적합성과 교차 접촉은 미확인입니다.",
                  "선택한 구성의 식사 정보를 업무 도구로 확인합니다. 주방 기구는 공용이며 할랄 인증을 받지 않았습니다.",
                )
            : value,
        ]),
      ),
    },
    products: current.products.map((product) => {
      const fixture = seed.products.find((item) => item.id === product.id);
      if (!fixture) return product;
      const fixtureIds = new Set(fixture.foodInfo.components.map((item) => item.id));
      return {
        ...product,
        text: Object.fromEntries(
          Object.entries(product.text).map(([locale, value]) => [
            locale,
            { ...value, description: fixture.text[locale]?.description ?? value.description },
          ]),
        ),
        foodInfo: {
          ...fixture.foodInfo,
          components: [
            ...fixture.foodInfo.components,
            ...product.foodInfo.components.filter((item) => !fixtureIds.has(item.id)),
          ],
        },
        modifiers: product.modifiers.map((group) => ({
          ...group,
          options: group.options.map((option) => {
            const source = fixture.modifiers
              .find((item) => item.id === group.id)
              ?.options.find((item) => item.id === option.id);
            return source ? { ...option, foodChanges: source.foodChanges } : option;
          }),
        })),
      };
    }),
  });
}

/** 運用者が明示実行するstaging専用seed更新。認証・卓・手動履歴・下書きは削除しない。 */
export async function refreshStagingSeed(env: RefreshEnv) {
  if (env.TABLECAST_ENV !== "staging" || !isHostedEmulator(env))
    throw new Error("staging以外のseedは更新できません。");
  const db = createDatabase(env.TABLECAST_DB);
  const ownership = await db.select().from(business.deploymentOwner);
  if (
    ownership.length !== 1 ||
    ownership[0]?.repository !== tablecastRepository ||
    ownership[0].environment !== "tablecast-staging" ||
    ownership[0].seeded !== 1
  )
    throw new Error("投入完了済みstagingのDB所有情報と一致しません。");
  const fixtures = demoStores("demo");
  const rows = await db
    .select({ store: business.stores, publisher: identity.member.userId })
    .from(business.stores)
    .innerJoin(
      identity.member,
      and(
        eq(identity.member.organizationId, business.stores.organization_id),
        eq(identity.member.role, "owner"),
      ),
    )
    .where(
      inArray(
        business.stores.id,
        fixtures.map((item) => item.id),
      ),
    );
  const result = [];
  for (const fixture of fixtures) {
    const row = rows.find((item) => item.store.id === fixture.id);
    if (!row) throw new Error(`seed店舗の所有者がありません: ${fixture.id}`);
    const current = configurationSchema.parse(JSON.parse(row.store.config_json));
    const configuration = refreshedSeedFood(current, fixture.configuration);
    const errors = configurationErrors(configuration);
    if (errors.length) throw new Error(`seed更新の構成が不正です: ${JSON.stringify(errors)}`);
    let version = row.store.config_version;
    const configJson = JSON.stringify(configuration);
    if (configJson !== JSON.stringify(current)) {
      const now = Date.now();
      const changed = await db.batch([
        db
          .update(business.stores)
          .set({ config_json: configJson, config_version: version + 1, updated_at: now })
          .where(
            and(eq(business.stores.id, fixture.id), eq(business.stores.config_version, version)),
          ),
        // 同じbatchのCAS成立を連鎖し、競合時は公開履歴・通知・確認を変えない。
        db.insert(business.configReleases).select(
          db
            .select({
              store_id: business.stores.id,
              version: business.stores.config_version,
              config_json: business.stores.config_json,
              published_by: sql<string>`${row.publisher}`.as("published_by"),
              source_draft_id: sql<null>`NULL`.as("source_draft_id"),
              created_at: sql<number>`${now}`.as("created_at"),
            })
            .from(business.stores)
            .where(and(eq(business.stores.id, fixture.id), sql`changes()=1`)),
        ),
        db.insert(business.tableEvents).select(
          db
            .select({
              store_id: business.stores.id,
              table_session_id: sql<null>`NULL`.as("table_session_id"),
              kind: sql<string>`'configuration.published'`.as("kind"),
              data_json:
                sql<string>`${JSON.stringify({ version: version + 1, source: "tablecast-plugin-seed" })}`.as(
                  "data_json",
                ),
              created_at: sql<number>`${now}`.as("created_at"),
            })
            .from(business.stores)
            .where(and(eq(business.stores.id, fixture.id), sql`changes()=1`)),
        ),
        db
          .update(business.confirmations)
          .set({ status: "invalid" })
          .where(
            and(
              eq(business.confirmations.store_id, fixture.id),
              inArray(business.confirmations.status, ["pending", "read"]),
              inArray(
                business.confirmations.table_session_id,
                db
                  .select({ id: business.tableSessions.id })
                  .from(business.tableSessions)
                  .where(eq(business.tableSessions.kind, "table")),
              ),
              sql`changes()=1`,
            ),
          ),
      ]);
      if (changed[0].meta.changes !== 1)
        throw new Error("店舗設定が競合しました。再取得してから実行してください。");
      version++;
    }
    // 履歴snapshotは固定の架空レシピ・価格で作り、既存の公開設定の編集に左右されない。
    const owner = { id: row.store.organization_id, userId: row.publisher };
    await seedPluginAnalytics(db, fixture, owner);
    await seedPluginRewards(db, fixture, owner);
    const [sessions, members, rules, coupons] = await db.batch([
      db
        .select({ count: count() })
        .from(business.tableSessions)
        .where(
          and(
            eq(business.tableSessions.store_id, fixture.id),
            like(business.tableSessions.id, `${fixture.id}-plugin-history-%`),
          ),
        ),
      db
        .select({ count: count() })
        .from(business.customerMemberships)
        .where(eq(business.customerMemberships.storeId, fixture.id)),
      db
        .select({ count: count() })
        .from(business.customerCouponRules)
        .where(eq(business.customerCouponRules.storeId, fixture.id)),
      db
        .select({ count: count() })
        .from(business.customerCoupons)
        .where(eq(business.customerCoupons.storeId, fixture.id)),
    ]);
    result.push({
      storeId: fixture.id,
      version,
      historicalSessions: sessions[0]?.count,
      members: members[0]?.count,
      couponRules: rules[0]?.count,
      coupons: coupons[0]?.count,
    });
  }
  if ((await db.all(sql`PRAGMA foreign_key_check`)).length)
    throw new Error("seedの外部キーが不整合です。");
  return result;
}

async function main() {
  if (process.env.TABLECAST_SEED_CONFIRM !== "tablecast-staging")
    throw new Error("TABLECAST_SEED_CONFIRM=tablecast-stagingが必要です。");
  const target = deploymentTarget(undefined, "staging");
  const sha = process.env.TABLECAST_RELEASE_SHA;
  if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error("実行元のcommit SHAが必要です。");
  const options = deploymentOptions(
    target,
    sha,
    tablecastAdoptedResources.staging.database,
    "false",
  );
  const api = apiSdkConfiguration(options.api);
  const directory = resolve(import.meta.dirname, "../.local/tablecast-staging-seed");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const configPath = resolve(directory, "storage.json");
  // DBの指定は通常配備と同じcloudflare.config.tsから取得する。
  await writeFile(
    configPath,
    JSON.stringify({
      name: "tablecast-staging-seed",
      account_id: tablecastAccountId,
      compatibility_date: api.compatibility_date,
      compatibility_flags: api.compatibility_flags,
      d1_databases: api.d1_databases.map((binding) => ({ ...binding, remote: true })),
    }),
  );
  const platform = await getPlatformProxy<Pick<TablecastEnv, "TABLECAST_DB">>({
    configPath,
    envFiles: [],
    remoteBindings: true,
    persist: false,
  });
  try {
    console.info(
      JSON.stringify({
        sha,
        stores: await refreshStagingSeed({
          ...platform.env,
          TABLECAST_ENV: "staging",
          TABLECAST_PUBLIC_ORIGIN: target.origin,
        }),
      }),
    );
  } finally {
    await platform.dispose();
  }
}

if (import.meta.main)
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
