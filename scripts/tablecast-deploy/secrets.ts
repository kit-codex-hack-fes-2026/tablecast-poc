import { createHmac } from "node:crypto";
import { z } from "zod";
import type { DeploymentTarget } from "./target.ts";
import { billingDeploymentVars, requiredApiSecrets, tablecastBillingSecrets } from "./settings.ts";

export function deploymentSecrets(
  target: DeploymentTarget,
  input: Record<string, string | undefined>,
) {
  const runtime = z
    .record(z.string(), z.string())
    .parse(JSON.parse(input.TABLECAST_RUNTIME_SECRETS ?? "{}"));
  const master = z.string().min(32).parse(input.TABLECAST_DEPLOY_SECRET);
  const derive = (purpose: string) =>
    createHmac("sha256", master).update(`${target.api}:${purpose}`).digest("hex");
  const required = (value: string | undefined, name: string) => {
    if (!value) throw new Error(`配備secretがありません: ${name}`);
    return value;
  };
  const secrets: Record<string, string> = {
    TABLECAST_OTEL_AUTHORIZATION: required(
      input.TABLECAST_OTEL_AUTHORIZATION,
      "TABLECAST_OTEL_AUTHORIZATION",
    ),
    TABLECAST_AUTH_SECRET: derive("auth"),
    TABLECAST_MODEL_API_KEY: required(runtime.TABLECAST_MODEL_API_KEY, "TABLECAST_MODEL_API_KEY"),
    TABLECAST_MODEL: required(input.TABLECAST_MODEL || runtime.TABLECAST_MODEL, "TABLECAST_MODEL"),
  };
  const enabledSecrets = requiredApiSecrets(
    target.environment,
    true,
    billingDeploymentVars(target.environment),
  );
  for (const key of tablecastBillingSecrets)
    if (enabledSecrets.includes(key)) secrets[key] = required(runtime[key], key);
  if (target.emulate) {
    secrets.TABLECAST_CONTAINER_METRICS_TOKEN = required(
      input.TABLECAST_CONTAINER_METRICS_TOKEN,
      "TABLECAST_CONTAINER_METRICS_TOKEN",
    );
  } else {
    secrets.TABLECAST_BETTER_AUTH_API_KEY = required(
      input.TABLECAST_BETTER_AUTH_API_KEY,
      "TABLECAST_BETTER_AUTH_API_KEY",
    );
    secrets.TABLECAST_GOOGLE_CLIENT_ID = required(
      input.TABLECAST_GOOGLE_CLIENT_ID,
      "TABLECAST_GOOGLE_CLIENT_ID",
    );
    secrets.TABLECAST_GOOGLE_CLIENT_SECRET = required(
      input.TABLECAST_GOOGLE_CLIENT_SECRET,
      "TABLECAST_GOOGLE_CLIENT_SECRET",
    );
  }
  if (target.environment === "preview") {
    secrets.CF_ACCESS_CLIENT_ID = required(input.CF_ACCESS_CLIENT_ID, "CF_ACCESS_CLIENT_ID");
    secrets.CF_ACCESS_CLIENT_SECRET = required(
      input.CF_ACCESS_CLIENT_SECRET,
      "CF_ACCESS_CLIENT_SECRET",
    );
  }
  return secrets;
}
