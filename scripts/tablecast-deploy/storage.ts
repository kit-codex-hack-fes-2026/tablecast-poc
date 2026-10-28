import { business, createDatabase } from "@tablecast/api/db";
import { migrateImageAssets } from "@tablecast/api/media-migration";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import type { deploymentOptions, deploymentSecrets } from "../tablecast-deploy-config.ts";
import type { readSeedTemplate } from "../tablecast-seed-template.ts";
import { apiCloudflareConfig, type apiSdkConfiguration } from "../../apps/api/cloudflare.config.ts";
import { cloudflare, currentRevision, waitForRelease } from "../tablecast-deploy-api.ts";
import { tablecastAccountId, tablecastRepository } from "../tablecast-deploy-config.ts";
import { seedPreviewDatabase } from "../tablecast-seed-data.ts";
import { resetStagingDatabase } from "../tablecast-staging-reset.ts";
import { cf, deployTemporaryWorker } from "./commands.ts";
import { verifyDurableNamespaces } from "./resources.ts";
import { directory, root, sha, target } from "./runtime.ts";
const { deploymentOwner } = business;

type StoragePreparation = {
  apiConfig: ReturnType<typeof apiSdkConfiguration>;
  bucketCreated: boolean;
  bucketExists: boolean;
  cleanup: boolean;
  database: { name: string; uuid: string };
  headers: Record<string, string>;
  options: ReturnType<typeof deploymentOptions>;
  reset: boolean;
  resetFinished: boolean;
  secrets: ReturnType<typeof deploymentSecrets> | undefined;
  seedTemplate: Awaited<ReturnType<typeof readSeedTemplate>> | undefined;
};

export async function prepareStorage({
  cleanup,
  reset,
  resetFinished,
  database,
  bucketExists,
  bucketCreated,
  options,
  apiConfig,
  secrets,
  headers,
  seedTemplate,
}: StoragePreparation) {
  console.time("DB・画像の配備準備");
  try {
    const storagePath = resolve(directory, "storage.json");
    await writeFile(
      storagePath,
      JSON.stringify({
        name: `${target.web}-storage`,
        account_id: tablecastAccountId,
        compatibility_date: "2026-09-03",
        images: { binding: "TABLECAST_IMAGES", remote: true },
        d1_databases: apiConfig.d1_databases.map((value) => ({ ...value, remote: true })),
        r2_buckets:
          bucketExists || bucketCreated
            ? apiConfig.r2_buckets.map((value) => ({ ...value, remote: true }))
            : [],
      }),
    );
    const platform = await getPlatformProxy<
      Pick<TablecastEnv, "TABLECAST_DB" | "TABLECAST_IMAGES" | "TABLECAST_MEDIA">
    >({
      configPath: storagePath,
      envFiles: [resolve(directory, "empty.env")],
      remoteBindings: true,
      persist: false,
    });
    try {
      if (bucketExists || bucketCreated) {
        const ownerKey = "tablecast/deployment-owner.json";
        const owner = {
          repository: tablecastRepository,
          environment: target.web,
          databaseId: database.uuid,
        };
        if (bucketCreated) await platform.env.TABLECAST_MEDIA.put(ownerKey, JSON.stringify(owner));
        const stored = await platform.env.TABLECAST_MEDIA.get(ownerKey);
        if (!stored || JSON.stringify(await stored.json()) !== JSON.stringify(owner))
          throw new Error("R2の所有情報が一致しません。");
      }
      const resetKey = "tablecast/staging-reset.json";
      if (target.environment === "staging") {
        const pending = await platform.env.TABLECAST_MEDIA.get(resetKey);
        if (pending && !reset && !resetFinished)
          throw new Error("stagingリセットが途中です。手動リセットを再実行してください。");
        if (reset) {
          if (pending) {
            const previous = z
              .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
              .safeParse(await pending.json());
            if (!previous.success)
              throw new Error("途中リセットの記録が不正です。所有情報を確認してください。");
            await platform.env.TABLECAST_MEDIA.put(
              resetKey,
              JSON.stringify({
                sha,
                previousSha: previous.data.sha,
                resumedAt: new Date().toISOString(),
              }),
            );
          } else {
            await waitForRelease(target.origin, headers, sha);
            await platform.env.TABLECAST_MEDIA.put(
              resetKey,
              JSON.stringify({ sha, startedAt: new Date().toISOString() }),
            );
          }
        }
      }
      const recordReset = async (phase: string) => {
        if (!reset) return;
        await platform.env.TABLECAST_MEDIA.put(
          resetKey,
          JSON.stringify({ sha, phase, updatedAt: new Date().toISOString() }),
        );
      };
      if (cleanup) {
        // Webを先に止め、他のWorkerが参照するAPIをforceで消さない。
        const registeredWorkers = z
          .array(z.object({ id: z.string() }))
          .parse(await cloudflare("workers/scripts"));
        if (reset) {
          const maintenance = resolve(directory, "maintenance.js");
          await writeFile(
            maintenance,
            'export default {fetch(){return new Response("TableCast staging maintenance", {status:503, headers:{"Cache-Control":"no-store"}})}};',
          );
          await deployTemporaryWorker(
            {
              name: target.web,
              entrypoint: maintenance,
              compatibilityDate: "2026-09-03",
              workersDev: true,
              previewUrls: false,
            },
            "maintenance",
          );
          await recordReset("maintenance");
        } else if (registeredWorkers.some((value) => value.id === target.web)) {
          await cf(["workers", "delete", target.web, "--force"]);
        }
        const namespaces = z
          .array(z.object({ id: z.string(), script: z.string(), class: z.string() }))
          .parse(await cloudflare("workers/durable_objects/namespaces?per_page=1000"));
        if (namespaces.length >= 1000) throw new Error("DO一覧の上限に達しました。");
        const owned = namespaces.filter((value) => value.script === target.api);
        const applications = z
          .array(
            z.object({
              id: z.string(),
              durable_objects: z.object({ namespace_id: z.string() }).optional(),
            }),
          )
          .parse(await cloudflare("containers/applications"));
        for (const application of applications) {
          if (owned.some((value) => value.id === application.durable_objects?.namespace_id))
            await cloudflare(`containers/applications/${application.id}`, "DELETE");
        }
        if (reset) {
          const maintenanceApi = resolve(directory, "maintenance-api.js");
          await writeFile(
            maintenanceApi,
            `export {StoreEvents, TablecastEmulate, TablecastVoiceUsage} from ${JSON.stringify(resolve(root, "apps/api/src/worker.ts"))}; export default {fetch(){return new Response("TableCast staging maintenance", {status:503})}};`,
          );
          const configured = apiCloudflareConfig(options.api);
          await deployTemporaryWorker(
            {
              ...configured.worker,
              entrypoint: maintenanceApi,
              exports: {
                TablecastVoiceUsage: { type: "durable-object", storage: "sqlite" },
                StoreEvents: { type: "durable-object", storage: "sqlite" },
                TablecastEmulate: { type: "durable-object", storage: "sqlite" },
              },
            },
            "maintenance-api",
          );
          await verifyDurableNamespaces();
        } else if (registeredWorkers.some((value) => value.id === target.api)) {
          if (owned.length) {
            const retired = resolve(directory, "retired.js");
            await writeFile(
              retired,
              'export default { fetch() { return new Response("PR closed", { status: 410 }); } };',
            );
            await deployTemporaryWorker(
              {
                name: target.api,
                entrypoint: retired,
                compatibilityDate: "2026-09-03",
                workersDev: false,
                previewUrls: false,
                exports: Object.fromEntries(
                  owned.map((value) => [value.class, { type: "durable-object", state: "deleted" }]),
                ),
              },
              "retired",
            );
          }
          await cf(["workers", "delete", target.api, "--force"]);
        }
        await recordReset("runtime-removed");
        if (bucketExists) {
          for (;;) {
            const objects = await platform.env.TABLECAST_MEDIA.list({ limit: 1000 });
            const keys = objects.objects
              .map((value) => value.key)
              .filter(
                (key) => key !== "tablecast/deployment-owner.json" && (!reset || key !== resetKey),
              );
            if (!keys.length) break;
            await platform.env.TABLECAST_MEDIA.delete(keys);
          }
          if (!reset) await platform.env.TABLECAST_MEDIA.delete("tablecast/deployment-owner.json");
        }
        await recordReset("media-cleared");
        if (reset)
          await resetStagingDatabase({
            ...platform.env,
            TABLECAST_ENV: target.environment,
            TABLECAST_PUBLIC_ORIGIN: target.origin,
          });
        await recordReset("data-cleared");
      } else {
        await currentRevision(target, sha);
        await cf([
          "d1",
          "migrations",
          "apply",
          database.uuid,
          "--dir",
          resolve(root, "apps/api/migrations"),
        ]);
        if (target.emulate && secrets) {
          const seeded = await seedPreviewDatabase(
            {
              ...platform.env,
              TABLECAST_AUTH_SECRET: secrets.TABLECAST_AUTH_SECRET ?? "",
              TABLECAST_ENV: target.environment,
              TABLECAST_PUBLIC_ORIGIN: target.origin,
            },
            {
              email: "haruka.sato@komorebi-shijo.com",
              otherEmail: "tsubasa.yamamoto@westward-burgers-kyoto.com",
              baseTime: Date.now(),
              profile: "demo",
            },
            seedTemplate,
          );
          if (seeded) {
            await createDatabase(platform.env.TABLECAST_DB)
              .update(deploymentOwner)
              .set({ seeded: 1 });
          }
        } else {
          await migrateImageAssets(platform.env);
        }
      }
    } finally {
      await platform.dispose();
    }
  } finally {
    console.timeEnd("DB・画像の配備準備");
  }
}
