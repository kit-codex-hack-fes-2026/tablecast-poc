import { business } from "@tablecast/api/db";
import { sql } from "drizzle-orm";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import { z } from "zod";
import { cloudflare, readBucketOwner } from "../tablecast-deploy-api.ts";
import {
  accessApplicationConfig,
  tablecastAdoptedResources,
  tablecastRepository,
} from "../tablecast-deploy-config.ts";
import { assertAccessConfiguration } from "../tablecast-infra-access.ts";
import { accessSchema, databaseSchema, target } from "./runtime.ts";
const { deploymentOwner } = business;

export async function resources(create: boolean) {
  const [databaseList, bucketList] = await Promise.all([
    cloudflare("d1/database?per_page=1000"),
    cloudflare("r2/buckets"),
  ]);
  const databases = z.array(databaseSchema).parse(databaseList);
  const { buckets } = z
    .object({ buckets: z.array(z.object({ name: z.string() })) })
    .parse(bucketList);
  if (databases.length >= 1000)
    throw new Error("D1一覧の上限に達しました。対象を再確認してください。");
  let databaseCreated = false;
  let database = databases.find((value) => value.name === target.database);
  if (
    target.environment !== "preview" &&
    database?.uuid !== tablecastAdoptedResources[target.environment].database
  )
    throw new Error("常設D1の採用IDが一致しません。作り直さず現物を照合してください。");
  if (!database && create) {
    database = databaseSchema.parse(
      await cloudflare("d1/database", "POST", {
        name: target.database,
        primary_location_hint: "apac",
      }),
    );
    databaseCreated = true;
  }
  if (database) {
    const databaseId = database.uuid;
    // 管理APIでもDrizzleがSQLと結果の対応を所有する。D1の配列応答を標準proxyへ渡す。
    const db = drizzleProxy(async (query, params, method) => {
      const result = z
        .array(
          z.object({
            success: z.literal(true),
            results: z.object({
              rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
            }),
          }),
        )
        .parse(await cloudflare(`d1/database/${databaseId}/raw`, "POST", { sql: query, params }));
      const rows = result[0]?.results.rows ?? [];
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    });
    if (databaseCreated) {
      await db.run(
        sql`CREATE TABLE tablecast_deployment_owner(repository TEXT NOT NULL, environment TEXT NOT NULL, seeded INTEGER NOT NULL DEFAULT 0)`,
      );
      await db
        .insert(deploymentOwner)
        .values({ repository: tablecastRepository, environment: target.web });
    }
    const owner = await db.select().from(deploymentOwner);
    if (
      owner.length !== 1 ||
      owner[0]?.repository !== tablecastRepository ||
      owner[0]?.environment !== target.web
    )
      throw new Error("D1の所有情報が一致しません。自動採用・削除は行いません。");
  }
  const bucketExists = buckets.some((value) => value.name === target.bucket);
  if (bucketExists) {
    const owner = await readBucketOwner(target.bucket);
    if (
      owner.repository !== tablecastRepository ||
      owner.environment !== target.web ||
      owner.databaseId !== database?.uuid
    )
      throw new Error("R2の所有情報が一致しません。対象外資源は変更・削除できません。");
  }
  if (!bucketExists && create)
    await cloudflare("r2/buckets", "POST", { name: target.bucket, locationHint: "apac" });
  return { database, bucketExists, bucketCreated: create && !bucketExists };
}

export async function accessApplication(create: boolean) {
  if (!target.emulate) return undefined;
  const [applications] = await Promise.all([
    cloudflare("access/apps?per_page=1000"),
    create && target.environment !== "staging" ? assertAccessConfiguration() : undefined,
  ]);
  const apps = z.array(accessSchema).parse(applications);
  if (apps.length >= 1000) throw new Error("Access一覧の上限に達しました。");
  const domain = new URL(target.origin).hostname;
  if (target.environment === "staging") {
    // 公開運用への移行時に旧staging専用applicationだけを解除する。
    const owned = apps.filter((value) => [target.web, `${target.web}-mcp`].includes(value.name));
    for (const app of owned) {
      const expected = app.name === target.web ? domain : `${domain}/mcp`;
      if (
        app.domain !== expected ||
        app.destinations?.some(
          (value) =>
            value.type !== "public" ||
            (value.uri !== domain && !value.uri?.startsWith(`${domain}/`)),
        )
      )
        throw new Error("staging Accessの所有対象が一致しません。");
    }
    if (create) {
      for (const app of owned) await cloudflare(`access/apps/${app.id}`, "DELETE");
    }
    return undefined;
  }
  const app = apps.find((value) => value.name === target.web);
  if (app && app.domain !== domain) throw new Error("Accessの所有対象が一致しません。");
  if (create) {
    await cloudflare(
      `access/apps${app ? `/${app.id}` : ""}`,
      app ? "PUT" : "POST",
      accessApplicationConfig(target.web, domain),
    );
  }
  return app;
}

export async function verifyDurableNamespaces() {
  const namespaces = z
    .array(
      z.object({ id: z.string(), script: z.string(), class: z.string(), use_sqlite: z.boolean() }),
    )
    .parse(await cloudflare("workers/durable_objects/namespaces?per_page=1000"));
  if (namespaces.length >= 1000) throw new Error("DO一覧の上限に達しました。");
  const owned = namespaces.filter((namespace) => namespace.script === target.api);
  if (
    owned.some(
      (namespace) =>
        !["StoreEvents", "TablecastEmulate", "TablecastVoiceUsage"].includes(namespace.class) ||
        !namespace.use_sqlite,
    )
  )
    throw new Error(
      "既存DOのクラス・storageが採用設定と一致しません。移行履歴を再実行せず照合してください。",
    );
  if (target.environment !== "preview") {
    for (const [className, id] of Object.entries(
      tablecastAdoptedResources[target.environment].namespaces,
    ))
      if (!owned.some((namespace) => namespace.class === className && namespace.id === id))
        throw new Error("常設DOの採用IDが一致しません。namespaceを作り直せません。");
  }
  return owned;
}
