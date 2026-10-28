import { eq } from "drizzle-orm";
import type { ImageAsset } from "./model";
import { createDatabase } from "../../db/client";
import { mediaAssets } from "../../db/media-schema";
import { customerCouponRules, customerCoupons } from "../../db/rewards-schema";
import {
  configDrafts,
  configReleases,
  demoSessions,
  stores,
  tableSessions,
} from "../../db/table-schema";
import { configurationSchema } from "../configuration/model";
import { couponRuleSchema } from "../customer-coupons/model";
import { generateImageAsset } from "./placeholder";
import { configurationImageKeys } from "./queries";

/** 配備・seedで再開可能な索引移行。設定JSONやR2の共有バイト列は書き換えない。 */
export async function migrateImageAssets(
  env: Pick<TablecastEnv, "TABLECAST_DB" | "TABLECAST_IMAGES" | "TABLECAST_MEDIA">,
) {
  const db = createDatabase(env.TABLECAST_DB);
  const [configurations, rules, coupons, indexed] = await db.batch([
    db
      .select({ storeId: stores.id, json: stores.config_json })
      .from(stores)
      .unionAll(
        db
          .select({ storeId: configDrafts.store_id, json: configDrafts.config_json })
          .from(configDrafts),
      )
      .unionAll(
        db
          .select({ storeId: configReleases.store_id, json: configReleases.config_json })
          .from(configReleases),
      )
      .unionAll(
        db
          .select({ storeId: tableSessions.store_id, json: demoSessions.config_json })
          .from(demoSessions)
          .innerJoin(tableSessions, eq(tableSessions.id, demoSessions.session_id)),
      ),
    db
      .select({ storeId: customerCouponRules.storeId, json: customerCouponRules.rulesJson })
      .from(customerCouponRules),
    db
      .select({ storeId: customerCoupons.storeId, json: customerCoupons.snapshotJson })
      .from(customerCoupons),
    db.select().from(mediaAssets),
  ]);
  const references = new Map<string, Set<string>>();
  const add = (storeId: string, key: string) => {
    const owners = references.get(key) ?? new Set<string>();
    owners.add(storeId);
    references.set(key, owners);
  };
  for (const row of configurations) {
    for (const key of configurationImageKeys(configurationSchema.parse(JSON.parse(row.json))))
      add(row.storeId, key);
  }
  for (const row of [...rules, ...coupons])
    add(row.storeId, couponRuleSchema.parse(JSON.parse(row.json)).imageKey);
  const existing = new Set(indexed.map((row) => JSON.stringify([row.store_id, row.image_key])));
  const missing: string[] = [];
  let inserted = 0;
  for (const [key, referencedStores] of references) {
    const owners = [...referencedStores].filter((id) => !existing.has(JSON.stringify([id, key])));
    if (!owners.length) continue;
    const object = await env.TABLECAST_MEDIA.get(key);
    if (!object) {
      missing.push(key);
      continue;
    }
    // アップロードの所有者を設定の参照だけで別店舗へ移さない。
    if (
      object.customMetadata?.storeId &&
      owners.some((id) => id !== object.customMetadata?.storeId)
    ) {
      throw new Error(`画像の所有店舗が一致しません: ${key}`);
    }
    const asset: ImageAsset = await generateImageAsset(
      env.TABLECAST_IMAGES,
      await object.arrayBuffer(),
    );
    for (let start = 0; start < owners.length; start += 20) {
      const rows = owners
        .slice(start, start + 20)
        .map((store_id) => ({ store_id, image_key: key, ...asset }));
      await db.insert(mediaAssets).values(rows).onConflictDoNothing();
      inserted += rows.length;
    }
  }
  console.info({ event: "tablecast.media_migration", inserted, missing });
  return { inserted, missing };
}
