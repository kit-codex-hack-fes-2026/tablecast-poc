import { z } from "zod";
import { cloudflare } from "../tablecast-deploy-api.ts";
import { type DeploymentTarget, tablecastAccess } from "../tablecast-deploy-config.ts";

const appSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  type: z.string(),
  destinations: z.array(z.object({ type: z.string(), uri: z.string().optional() })).optional(),
  policies: z.array(z.object({ id: z.string() })).default([]),
});
const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  decision: z.string(),
  include: z.array(z.json()),
  require: z.array(z.json()).default([]),
  exclude: z.array(z.json()).default([]),
  reusable: z.boolean(),
  app_count: z.number().int().nonnegative(),
});

// PR専用の公開Webhookだけを扱い、店舗画面や他APIのAccess保護には触れない。
export async function syncPosWebhookAccess(
  target: DeploymentTarget,
  enabled: boolean,
  request = cloudflare,
) {
  if (target.environment !== "preview") return;
  const name = `${target.web}-square-webhook`;
  const domain = `${new URL(target.origin).hostname}/api/pos/square/webhook`;
  const [appList, policyList] = await Promise.all([
    request("access/apps?per_page=1000"),
    request("access/policies?per_page=1000"),
  ]);
  const apps = z.array(appSchema).parse(appList);
  const policies = z.array(z.object({ id: z.string(), name: z.string() })).parse(policyList);
  if (apps.length >= 1000 || policies.length >= 1000)
    throw new Error("Access一覧の上限に達しました。");
  const matches = apps.filter((app) => app.name === name);
  const policyMatches = policies.filter((policy) => policy.name === name);
  if (matches.length > 1 || policyMatches.length > 1)
    throw new Error("Square WebhookのAccess所有対象が重複しています。");
  const app = matches[0];
  const policyMatch = policyMatches[0];
  let policy = policyMatch
    ? policySchema.parse(await request(`access/policies/${policyMatch.id}`))
    : undefined;
  const assertPolicy = (value: z.infer<typeof policySchema>) => {
    if (
      value.name !== name ||
      !value.reusable ||
      value.decision !== "bypass" ||
      JSON.stringify(value.include) !== '[{"everyone":{}}]' ||
      value.require.length ||
      value.exclude.length ||
      value.app_count > 1
    )
      throw new Error("Square WebhookのAccess policyが所有範囲と一致しません。");
  };
  const assertApp = (value: z.infer<typeof appSchema>, policyId: string) => {
    if (
      value.name !== name ||
      value.type !== "self_hosted" ||
      value.domain !== domain ||
      value.destinations?.some((entry) => entry.type !== "public" || entry.uri !== domain) ||
      value.policies.length !== 1 ||
      value.policies[0]?.id !== policyId
    )
      throw new Error("Square WebhookのAccess applicationが所有範囲と一致しません。");
  };
  if (policy) assertPolicy(policy);
  if (app) {
    if (!policy) throw new Error("Square WebhookのAccess policyを確認できません。");
    assertApp(app, policy.id);
  }
  if (policy && policy.app_count !== (app ? 1 : 0))
    throw new Error("Square WebhookのAccess policyが他のapplicationで使われています。");
  if (!enabled) {
    if (app) await request(`access/apps/${app.id}`, "DELETE");
    // 別applicationへ共有されたpolicyは上で拒否し、自分の例外だけを削除する。
    if (policy) await request(`access/policies/${policy.id}`, "DELETE");
    return;
  }
  const root = apps.find((value) => value.name === target.web);
  if (
    root?.type !== "self_hosted" ||
    root.domain !== new URL(target.origin).hostname ||
    root.destinations?.some(
      (entry) => entry.type !== "public" || entry.uri !== new URL(target.origin).hostname,
    ) ||
    root.policies.length !== tablecastAccess.policies.length ||
    !tablecastAccess.policies.every((expected) =>
      root.policies.some((actual) => actual.id === expected.id),
    )
  )
    throw new Error("PRプレビュー本体のAccess保護を確認できません。");
  if (!policy) {
    policy = policySchema.parse(
      await request("access/policies", "POST", {
        name,
        decision: "bypass",
        include: [{ everyone: {} }],
        require: [],
        exclude: [],
      }),
    );
    assertPolicy(policy);
  }
  if (!app) {
    const created = appSchema.parse(
      await request("access/apps", "POST", {
        name,
        domain,
        type: "self_hosted",
        policies: [{ id: policy.id, precedence: 1 }],
      }),
    );
    assertApp(created, policy.id);
    assertApp(appSchema.parse(await request(`access/apps/${created.id}`)), policy.id);
  }
  assertPolicy(policySchema.parse(await request(`access/policies/${policy.id}`)));
}

export async function verifyPosWebhookAccess(origin: string, request: typeof fetch = fetch) {
  const response = await request(new URL("/api/pos/square/webhook", origin), {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  const result = z
    .object({ error: z.object({ code: z.string() }) })
    .safeParse(await response.json().catch(() => null));
  if (
    response.status !== 403 ||
    !result.success ||
    result.data.error.code !== "POS_WEBHOOK_SIGNATURE"
  )
    throw new Error("未署名WebhookがSquare署名検証へ到達して拒否されることを確認できません。");
  const protectedResponse = await request(new URL("/api/health", origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  const location = protectedResponse.headers.get("location");
  if (
    protectedResponse.status !== 302 ||
    !location ||
    !new URL(location, origin).hostname.endsWith(".cloudflareaccess.com")
  )
    throw new Error("Square Webhook以外のPRプレビューのAccess保護を確認できません。");
}
