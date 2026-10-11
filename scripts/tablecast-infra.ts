import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { cloudflare, currentRevision } from "./tablecast-deploy-api";
import {
  deploymentConfigs,
  deploymentTarget,
  deploymentBuildOutput,
  deploymentSecrets,
} from "./tablecast-deploy-config";
import { resources, accessApplication, verifyDurableNamespaces } from "./tablecast-deploy";
import { reconcileAccess } from "./tablecast-infra-access";
import { canonical, assertWorkerOwner, workerConfigurationDiff } from "./tablecast-infra-diff";
import { catalogKinds, catalogTarget } from "./tablecast-catalog-config";
import { accessApplicationConfig } from "../infra/tablecast.config";
import { ownedCatalogApplication } from "./tablecast-catalog-deploy";
import { readBuildOutput } from "@cloudflare/build-output-utils";

const root = resolve(import.meta.dirname, "..");
const apply = process.argv.includes("--apply");
const target = deploymentTarget(
  process.env.TABLECAST_PR_NUMBER || undefined,
  z.enum(["preview", "staging", "production"]).parse(process.env.TABLECAST_DEPLOY_ENV),
);
const sha = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .parse(process.env.TABLECAST_RELEASE_SHA);
const accessChanges = await reconcileAccess();
const storage = await resources(false);
await accessApplication(false);
const namespaces = await verifyDurableNamespaces();
const desired = deploymentConfigs(
  target,
  sha,
  storage.database?.uuid ?? "11111111-1111-4111-8111-111111111111",
);
const workers = z.array(z.object({ id: z.string() })).parse(await cloudflare("workers/scripts"));
const changes: { resource: string; action: string; fields?: string[] }[] = [
  ...accessChanges,
  { resource: target.database, action: storage.database ? "unchanged" : "create" },
  { resource: target.bucket, action: storage.bucketExists ? "unchanged" : "create" },
];
for (const config of [desired.api, desired.web]) {
  const name = z.string().parse(config.name);
  if (!workers.some((worker) => worker.id === name)) {
    changes.push({ resource: name, action: "create" });
    continue;
  }
  const actual = z
    .record(z.string(), z.unknown())
    .parse(await cloudflare(`workers/scripts/${name}/settings`));
  assertWorkerOwner(actual, target, name === target.api, storage.database?.uuid);
  const schedules = await cloudflare(`workers/scripts/${name}/schedules`);
  const fields = workerConfigurationDiff(config, actual, schedules);
  const subdomain = z
    .object({ enabled: z.boolean(), previews_enabled: z.boolean().optional() })
    .parse(await cloudflare(`workers/scripts/${name}/subdomain`));
  if (subdomain.enabled !== config.workers_dev) fields.push("workers_dev");
  if (subdomain.previews_enabled !== config.preview_urls) fields.push("preview_urls");
  changes.push({ resource: name, action: fields.length ? "update" : "unchanged", fields });
}
const containers = z
  .array(
    z.object({
      name: z.string(),
      durable_objects: z.object({ namespace_id: z.string() }),
      max_instances: z.number(),
      configuration: z.looseObject({ image: z.string() }),
    }),
  )
  .parse(await cloudflare("containers/applications"));
if (target.emulate) {
  const name = `${target.api}-tablecastemulate`;
  const actual = containers.find((container) => container.name === name);
  if (
    actual &&
    !namespaces.some(
      (namespace) =>
        namespace.id === actual.durable_objects.namespace_id &&
        namespace.class === "TablecastEmulate",
    )
  )
    throw new Error("Containerの所有namespaceが一致しません。");
  const fields = actual
    ? [
        actual.configuration.image !==
        `registry.cloudflare.com/${desired.api.account_id}/tablecast-emulate:${sha}`
          ? "image"
          : "",
        actual.max_instances !== 1 ? "maxInstances" : "",
      ].filter(Boolean)
    : [];
  changes.push({
    resource: name,
    action: actual ? (fields.length ? "update" : "unchanged") : "create",
    fields,
  });
}
if (target.pr) {
  const apps = z
    .array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        domain: z.string().optional(),
        destinations: z
          .array(
            z.looseObject({
              type: z.string(),
              worker_id: z.string().optional(),
              uri: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .parse(await cloudflare("access/apps?per_page=1000"));
  for (const destination of [
    { name: target.web, origin: target.origin },
    ...catalogKinds.map((kind) => catalogTarget(target.pr ?? "", kind)),
  ]) {
    const actual = apps.find((app) => app.name === destination.name);
    const worker = workers.some((registered) => registered.id === destination.name)
      ? z.object({ id: z.string() }).parse(await cloudflare(`workers/workers/${destination.name}`))
      : undefined;
    if (actual)
      ownedCatalogApplication(
        actual,
        destination.name,
        new URL(destination.origin).hostname,
        worker?.id,
      );
    const expected = accessApplicationConfig(
      destination.name,
      new URL(destination.origin).hostname,
      destination.name === target.web ? undefined : worker?.id,
    );
    const comparable = actual
      ? Object.fromEntries(
          Object.keys(expected).map((key) => [
            key,
            key === "policies"
              ? z.array(z.object({ id: z.string(), precedence: z.number() })).parse(actual[key])
              : actual[key],
          ]),
        )
      : undefined;
    changes.push({
      resource: `Access:${destination.name}`,
      action: !actual
        ? "create"
        : canonical(comparable) === canonical(expected)
          ? "unchanged"
          : "update",
    });
    if (destination.name !== target.web)
      changes.push({
        resource: destination.name,
        action: worker ? "deploy" : "create",
        fields: ["assets.releaseSha"],
      });
  }
}
// 値や許可対象をログへ出さず、差分のある設定名だけを表示する。
console.info(
  JSON.stringify(
    {
      apply,
      environment: target.environment,
      sha,
      changes,
      durableNamespaces: namespaces.map(({ id, class: className }) => ({ id, className })),
    },
    null,
    2,
  ),
);
if (apply) {
  deploymentSecrets(target, { ...process.env });
  await currentRevision(target, sha);
  deploymentBuildOutput(await readBuildOutput(resolve(root, "apps/web")), target, sha);
  await reconcileAccess(true);
  execFileSync("bun", ["--no-env-file", "run", "deploy"], { cwd: root, stdio: "inherit" });
  if (target.pr)
    execFileSync("bun", ["--no-env-file", "run", "deploy:catalog"], {
      cwd: root,
      stdio: "inherit",
    });
}
