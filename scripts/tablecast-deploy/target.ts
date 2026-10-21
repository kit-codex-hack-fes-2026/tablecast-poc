import { z } from "zod";
import { billingDeploymentVars, tablecastAccountId, tablecastBillingVars } from "./settings.ts";

export function deploymentTarget(pr?: string, environment = pr ? "preview" : "production") {
  const mode = z.enum(["production", "staging", "preview"]).parse(environment);
  if ((mode === "preview") !== Boolean(pr)) throw new Error("配備環境とPR番号が一致しません。");
  if (pr !== undefined && !/^[1-9][0-9]{0,8}$/.test(pr)) throw new Error("PR番号が不正です。");
  const suffix = pr ? `-pr-${pr}` : mode === "staging" ? "-staging" : "";
  const web = `tablecast${suffix}`;
  return {
    pr,
    environment: mode,
    branch: mode === "production" ? "main" : mode === "staging" ? "staging" : undefined,
    emulate: mode !== "production",
    web,
    api: `tablecast-api${suffix}`,
    database: `tablecast-db${suffix}`,
    bucket: `tablecast-media${suffix}`,
    origin: `https://${web}.kit-codex.workers.dev`,
  };
}

export type DeploymentTarget = ReturnType<typeof deploymentTarget>;

export function deploymentOptions(
  target: DeploymentTarget,
  sha: string,
  databaseId: string,
  captureContent = "true",
) {
  z.string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(sha);
  z.uuid()
    .refine((value) => value !== "00000000-0000-0000-0000-000000000000")
    .parse(databaseId);
  const telemetryVars = {
    TABLECAST_ENV: target.environment,
    TABLECAST_RELEASE_SHA: sha,
    TABLECAST_PR_NUMBER: target.pr ?? "",
    TABLECAST_OTEL_CAPTURE_CONTENT: z.enum(["true", "false"]).parse(captureContent),
    TABLECAST_OTEL_ENDPOINT: "https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp",
  };
  const billingVars = billingDeploymentVars(target.environment);
  const apiVars = {
    ...Object.fromEntries(
      tablecastBillingVars.flatMap((key) =>
        billingVars[key] === undefined ? [] : [[key, billingVars[key]]],
      ),
    ),
    ...telemetryVars,
    TABLECAST_CLOUDFLARE_ACCOUNT_ID: tablecastAccountId,
    TABLECAST_CONTAINER_METRICS_APPLICATIONS: JSON.stringify(
      target.emulate ? [`${target.api}-tablecastemulate`] : [],
    ),
    TABLECAST_PUBLIC_ORIGIN: target.origin,
    TABLECAST_VOICE_ENABLED: "true",
    ...(target.emulate
      ? {
          TABLECAST_GOOGLE_EMULATOR_URL: "http://tablecast-emulate",
          TABLECAST_GOOGLE_AUTHORIZE_URL: `${target.origin}/_tablecast/oauth`,
        }
      : {}),
  };
  return {
    api: {
      name: target.api,
      accountId: tablecastAccountId,
      environment: target.environment,
      database: { name: target.database, id: databaseId },
      bucket: target.bucket,
      vars: apiVars,
      containerImage: `registry.cloudflare.com/${tablecastAccountId}/tablecast-emulate:${sha}`,
    },
    web: {
      name: target.web,
      accountId: tablecastAccountId,
      api: target.api,
      environment: target.environment,
      vars: telemetryVars,
    },
  };
}
