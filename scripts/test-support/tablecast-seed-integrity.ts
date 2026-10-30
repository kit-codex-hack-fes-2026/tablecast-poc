import { business, createDatabase } from "@tablecast/api/db";
import { configurationSchema } from "@tablecast/api/schema";
import { eq, sql } from "drizzle-orm";
import { expect } from "vitest";
import { z } from "zod";
import type { DemoCredentials } from "../tablecast-seed.ts";
import { seedDemoDatabase, tablecastHistoryBaseTime } from "../tablecast-seed-data.ts";
const { tableEvents } = business;

export async function seedIntegrity(env: TablecastEnv, credentials: DemoCredentials) {
  const platform = { env };
  const db = createDatabase(env.TABLECAST_DB);
  const counts = await seedDemoDatabase(platform.env, credentials);
  // Then: 規模だけでなく組織、プラン、支払、時系列の整合性を持つ。
  expect(counts).toMatchObject({
    stores: 3,
    tables: 36,
    historicalSessions: 900,
    orders: 3615,
  });
  expect(counts.events).toBeGreaterThanOrEqual(20_000);
  const catalogs = {
    results: await db.all<{ config_json: string }>(sql`SELECT config_json FROM stores`),
  };
  const products = catalogs.results.flatMap(
    (row) => configurationSchema.parse(JSON.parse(row.config_json)).products,
  );
  expect(products).toHaveLength(102);
  for (const product of products.filter((item) => item.imageKey))
    expect(product.imageKey).toMatch(/^tablecast\/images\/[a-f0-9]{64}\.webp$/);
  for (const product of products) {
    expect(product.imageKind).toBe("illustration");
  }
  expect(
    products.find((product) => product.id === "tablecast-komorebi-karaage")?.foodInfo.base,
  ).toMatchObject({ allergens: { wheat: "contains", soya: "contains" }, crossContact: "possible" });
  expect(
    products.find((product) => product.id === "tablecast-komorebi-pickles")?.foodInfo.base
      .allergens,
  ).toMatchObject({ wheat: "not_used", soya: "not_used" });
  expect(products.some((product) => product.foodInfo.components.length > 0)).toBe(true);
  expect(await db.get(sql`SELECT COUNT(DISTINCT organization_id) AS count FROM stores`)).toEqual({
    count: 3,
  });
  expect(
    await db.get(
      sql`SELECT COUNT(DISTINCT CAST((opened_at-${tablecastHistoryBaseTime})/86400000 AS INTEGER)) AS days FROM table_sessions WHERE id LIKE '%-history-%' AND id NOT LIKE '%-plugin-history-%'`,
    ),
  ).toEqual({ days: 30 });
  expect(
    await db.get(
      sql`SELECT COUNT(*) AS count FROM table_sessions WHERE plan_json IS NOT NULL AND status='open'`,
    ),
  ).toEqual({ count: 3 });
  expect(
    await db.get(
      sql`SELECT COUNT(*) AS count FROM restaurant_tables t WHERE NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.status='open')`,
    ),
  ).toEqual({ count: 6 });
  expect({
    results: await db.all(
      sql`SELECT s.id FROM table_sessions s WHERE status='closed' AND (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.table_session_id=s.id AND o.status NOT IN ('cancelled','rejected'))+COALESCE(json_extract(s.plan_json,'$.rules.pricePerPerson')*s.guest_count,0)+(SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.table_session_id=s.id AND p.kind='adjustment')!=(SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.table_session_id=s.id AND p.kind='payment')`,
    ),
  }).toMatchObject({ results: [] });
  expect({
    results: await db.all(
      sql`SELECT o.id FROM orders o JOIN confirmations c ON c.id=o.snapshot_id JOIN table_sessions s ON s.id=o.table_session_id WHERE o.store_id!=s.store_id OR c.store_id!=o.store_id OR o.total!=json_extract(o.snapshot_json,'$.total') OR o.created_at<c.created_at OR o.updated_at<o.created_at`,
    ),
  }).toMatchObject({ results: [] });
  expect({
    results: await db.all(
      sql`SELECT cursor FROM (SELECT cursor,created_at,LAG(created_at) OVER(PARTITION BY table_session_id ORDER BY cursor) AS previous FROM table_events) WHERE created_at<previous`,
    ),
  }).toMatchObject({ results: [] });
  expect(await db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  const conversation = (
    await db
      .select({ data: tableEvents.data_json })
      .from(tableEvents)
      .where(eq(tableEvents.table_session_id, "tablecast-komorebi-table-02-session"))
      .orderBy(tableEvents.cursor)
  )
    .map((row) =>
      z
        .object({
          source: z.literal("synthetic-demo"),
          role: z.string().optional(),
          text: z.string().optional(),
          speaker: z.object({ id: z.string().nullable() }).optional(),
        })
        .parse(JSON.parse(row.data)),
    )
    .filter((line) => line.role === "user");
  expect(new Set(conversation.map((line) => line.speaker?.id))).toEqual(
    new Set([
      "tablecast-komorebi-table-02-session-synthetic-stream:0",
      "tablecast-komorebi-table-02-session-synthetic-stream:1",
      null,
    ]),
  );
  expect(conversation.some((line) => line.text?.includes("一つに訂正"))).toBe(true);

  return counts;
}
export async function assertSeedIcons(env: TablecastEnv) {
  const platform = { env };
  const db = createDatabase(env.TABLECAST_DB);
  const seededIcons = {
    results: await db.all<{ url: null | string }>(
      sql`SELECT image AS url FROM user WHERE image IS NOT NULL UNION ALL SELECT logo AS url FROM organization`,
    ),
  };
  expect(seededIcons.results.length).toBe(12);
  for (const { url } of seededIcons.results) {
    expect(url).toMatch(/^\/api\/avatars\/[a-f0-9-]+$/);
    const image = await platform.env.TABLECAST_MEDIA.get(
      `tablecast/avatars/${url?.split("/").at(-1)}`,
    );
    expect(image?.httpMetadata?.contentType).toBe("image/webp");
    if (!image) throw new Error("seed画像がありません。");
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WEBP");
  }
}
