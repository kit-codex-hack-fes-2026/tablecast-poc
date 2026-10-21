import type { getPlatformProxy } from "wrangler";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { deploymentOptions } from "../tablecast-deploy-config.ts";
import { apiCloudflareConfig } from "../../apps/api/cloudflare.config.ts";
import { cloudflare } from "../tablecast-deploy-api.ts";
import { resetStagingDatabase } from "../tablecast-staging-reset.ts";
import { cf, deployTemporaryWorker } from "./commands.ts";
import { verifyDurableNamespaces } from "./resources.ts";
import { directory, root, target } from "./runtime.ts";

type StoragePlatform = Awaited<
  ReturnType<typeof getPlatformProxy<Pick<TablecastEnv, "TABLECAST_DB" | "TABLECAST_MEDIA">>>
>;

type DeploymentRuntime = {
  bucketExists: boolean;
  options: ReturnType<typeof deploymentOptions>;
  platform: StoragePlatform;
  recordReset: (phase: string) => Promise<void>;
  reset: boolean;
  resetKey: string;
};

export async function cleanDeploymentRuntime({
  platform,
  reset,
  options,
  recordReset,
  bucketExists,
  resetKey,
}: DeploymentRuntime) {
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
        .filter((key) => key !== "tablecast/deployment-owner.json" && (!reset || key !== resetKey));
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
}
