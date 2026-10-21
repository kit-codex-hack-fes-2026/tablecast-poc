import { business, createDatabase } from "@tablecast/api/db";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { z } from "zod";
import type { apiSdkConfiguration } from "../../apps/api/cloudflare.config.ts";
import type { deploymentOptions, deploymentSecrets } from "../tablecast-deploy-config.ts";
import type { readSeedTemplate } from "../tablecast-seed-template.ts";
import { currentRevision, waitForRelease } from "../tablecast-deploy-api.ts";
import { tablecastAccountId, tablecastRepository } from "../tablecast-deploy-config.ts";
import { seedPreviewDatabase } from "../tablecast-seed-data.ts";
import { cleanDeploymentRuntime } from "./cleanup.ts";
import { cf } from "./commands.ts";
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
        d1_databases: apiConfig.d1_databases.map((value) => ({ ...value, remote: true })),
        r2_buckets:
          bucketExists || bucketCreated
            ? apiConfig.r2_buckets.map((value) => ({ ...value, remote: true }))
            : [],
      }),
    );
    const platform = await getPlatformProxy<Pick<TablecastEnv, "TABLECAST_DB" | "TABLECAST_MEDIA">>(
      {
        configPath: storagePath,
        envFiles: [resolve(directory, "empty.env")],
        remoteBindings: true,
        persist: false,
      },
    );
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
        await cleanDeploymentRuntime({
          platform,
          reset,
          options,
          recordReset,
          bucketExists,
          resetKey,
        });
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
              password: crypto.randomUUID(),
              otherPassword: crypto.randomUUID(),
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
        }
      }
    } finally {
      await platform.dispose();
    }
  } finally {
    console.timeEnd("DB・画像の配備準備");
  }
}
