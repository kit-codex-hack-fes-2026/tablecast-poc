import type { BuildOutput } from "@cloudflare/build-output-utils";
import { OutputWorkerSchema } from "@cloudflare/config";
import { z } from "zod";
import type { DeploymentTarget } from "./target.ts";
import {
  billingDeploymentVars,
  requiredApiSecrets,
  tablecastAccountId,
  tablecastBillingVars,
} from "./settings.ts";

export function deploymentBuildOutput(output: BuildOutput, target: DeploymentTarget, sha: string) {
  if (output.rootConfig.buildContext.mode !== target.environment)
    throw new Error("Build Outputのmodeが一致しません。");
  const workers = Object.values(output.workers);
  if (workers.length !== 2) throw new Error("Build OutputのWorker数が一致しません。");
  for (const name of [target.api, target.web]) {
    const worker = workers.find((candidate) => candidate.config.name === name);
    if (!worker?.bundleDir) throw new Error(`Worker成果物がありません: ${name}`);
    const secrets =
      name === target.api
        ? requiredApiSecrets(target.environment, true, billingDeploymentVars(target.environment))
        : ["TABLECAST_OTEL_AUTHORIZATION"];
    for (const secret of secrets)
      z.object({ type: z.literal("secret") }).parse(worker.config.env?.[secret]);
    z.object({
      TABLECAST_ENV: z.object({ type: z.literal("text"), value: z.literal(target.environment) }),
      TABLECAST_RELEASE_SHA: z.object({ type: z.literal("text"), value: z.literal(sha) }),
      TABLECAST_PR_NUMBER: z.object({ type: z.literal("text"), value: z.literal(target.pr ?? "") }),
    }).parse(worker.config.env);
    if (name === target.api) {
      for (const key of tablecastBillingVars) {
        const expected =
          billingDeploymentVars(target.environment)[key] ??
          (key.endsWith("_ENABLED") ? "false" : "");
        const binding = worker.config.env?.[key];
        if (binding?.type !== "text" || binding.value !== expected)
          throw new Error("課金設定がbuild成果物と異なります。設定を揃えて再buildしてください。");
      }
      z.object({
        TABLECAST_DB: z.object({
          type: z.literal("d1"),
          name: z.literal(target.database),
          id: z.literal("11111111-1111-4111-8111-111111111111"),
        }),
        TABLECAST_MEDIA: z.object({ type: z.literal("r2"), name: z.literal(target.bucket) }),
      }).parse(worker.config.env);
      z.object({
        TablecastVoiceUsage: z.object({
          type: z.literal("durable-object"),
          storage: z.literal("sqlite"),
        }),
        StoreEvents: z.object({ type: z.literal("durable-object"), storage: z.literal("sqlite") }),
        TablecastEmulate: z.object({
          type: z.literal("durable-object"),
          storage: z.literal("sqlite"),
        }),
      }).parse(worker.config.exports);
    } else {
      z.object({
        TABLECAST_API: z.object({ type: z.literal("worker"), worker: z.literal(target.api) }),
      }).parse(worker.config.env);
    }
  }
  if (output.containers.length !== (target.emulate ? 1 : 0))
    throw new Error("Build OutputのContainer数が一致しません。");
  for (const container of output.containers)
    z.object({
      name: z.literal(`${target.api}-tablecastemulate`),
      image: z.object({
        reference: z.literal(
          `registry.cloudflare.com/${tablecastAccountId}/tablecast-emulate:${sha}`,
        ),
      }),
    }).parse(container.config);
  return workers;
}

export function bindDeploymentDatabase(
  input: unknown,
  target: DeploymentTarget,
  databaseId: string,
) {
  const config = OutputWorkerSchema.parse(input);
  if (config.name !== target.api) throw new Error("実D1を別Workerへ設定できません。");
  const database = z
    .object({
      type: z.literal("d1"),
      name: z.literal(target.database),
      id: z.literal("11111111-1111-4111-8111-111111111111"),
    })
    .parse(config.env?.TABLECAST_DB);
  return {
    ...config,
    env: { ...config.env, TABLECAST_DB: { ...database, id: z.uuid().parse(databaseId) } },
  };
}
