import { describe, expect, test, vi } from "vitest";
import type { cloudflare } from "./tablecast-deploy-api.ts";
import { deploymentTarget, tablecastAccess } from "./tablecast-deploy-config.ts";
import { syncPosWebhookAccess, verifyPosWebhookAccess } from "./tablecast-deploy/pos-access.ts";

const target = deploymentTarget("436");
const name = `${target.web}-square-webhook`;
const host = new URL(target.origin).hostname;
const webhookDomain = `${host}/api/pos/square/webhook`;

function accessFixture() {
  const root = {
    id: "root-app",
    name: target.web,
    type: "self_hosted",
    domain: host,
    policies: tablecastAccess.policies.map(({ id }) => ({ id })),
  };
  const webhook = {
    id: "webhook-app",
    name,
    type: "self_hosted",
    domain: webhookDomain,
    policies: [{ id: "webhook-policy" }],
  };
  const policy = {
    id: "webhook-policy",
    name,
    decision: "bypass",
    include: [{ everyone: {} }],
    require: [],
    exclude: [],
    reusable: true,
    app_count: 0,
  };
  let hasApp = false;
  let hasPolicy = false;
  const request = vi.fn<typeof cloudflare>(async (path, method = "GET", body) => {
    if (method === "GET") {
      if (path === "access/apps?per_page=1000")
        return structuredClone(hasApp ? [root, webhook] : [root]);
      if (path === "access/policies?per_page=1000")
        return hasPolicy ? [{ id: policy.id, name: policy.name }] : [];
      if (path === "access/apps/webhook-app" && hasApp) return structuredClone(webhook);
      if (path === "access/policies/webhook-policy" && hasPolicy) return structuredClone(policy);
    }
    if (method === "POST" && path === "access/policies") {
      hasPolicy = true;
      return structuredClone(policy);
    }
    if (method === "POST" && path === "access/apps") {
      hasApp = true;
      policy.app_count = 1;
      return structuredClone(webhook);
    }
    if (method === "DELETE" && path === "access/apps/webhook-app") {
      hasApp = false;
      policy.app_count = 0;
      return undefined;
    }
    if (method === "DELETE" && path === "access/policies/webhook-policy") {
      hasPolicy = false;
      return undefined;
    }
    throw new Error(`想定外のAccess要求: ${method} ${path} ${Boolean(body)}`);
  });
  return {
    request,
    root,
    webhook,
    policy,
    existing() {
      hasApp = true;
      hasPolicy = true;
      policy.app_count = 1;
    },
  };
}

describe("Square WebhookのPR専用Access例外", () => {
  test("stagingと本番のAccess設定は操作しない", async () => {
    const fixture = accessFixture();
    await syncPosWebhookAccess(deploymentTarget(undefined, "staging"), true, fixture.request);
    await syncPosWebhookAccess(deploymentTarget(), true, fixture.request);
    expect(fixture.request).not.toHaveBeenCalled();
  });

  test("保護されたPR本体を維持し、一つのWebhookパスへ再利用可能policyを作る", async () => {
    const fixture = accessFixture();
    const root = structuredClone(fixture.root);
    await syncPosWebhookAccess(target, true, fixture.request);
    expect(fixture.request).toHaveBeenCalledWith("access/policies", "POST", {
      name,
      decision: "bypass",
      include: [{ everyone: {} }],
      require: [],
      exclude: [],
    });
    expect(fixture.request).toHaveBeenCalledWith("access/apps", "POST", {
      name,
      domain: webhookDomain,
      type: "self_hosted",
      policies: [{ id: "webhook-policy", precedence: 1 }],
    });
    expect(fixture.root).toEqual(root);
    const writes = fixture.request.mock.calls.filter(([, method]) => method && method !== "GET");
    expect(writes).toHaveLength(2);
    await syncPosWebhookAccess(target, true, fixture.request);
    expect(fixture.request.mock.calls.filter(([, method]) => method === "POST")).toHaveLength(2);
  });

  test("Square無効化と終了時には自分の例外だけを削除する", async () => {
    const fixture = accessFixture();
    fixture.existing();
    await syncPosWebhookAccess(target, false, fixture.request);
    expect(fixture.request.mock.calls.filter(([, method]) => method === "DELETE")).toEqual([
      ["access/apps/webhook-app", "DELETE"],
      ["access/policies/webhook-policy", "DELETE"],
    ]);
    expect(fixture.root.domain).toBe(host);
  });

  test("同じ名前でもパスが広いapplicationは変更せず拒否する", async () => {
    const fixture = accessFixture();
    fixture.existing();
    fixture.webhook.domain = `${host}/api/*`;
    await expect(syncPosWebhookAccess(target, false, fixture.request)).rejects.toThrow(
      "所有範囲と一致しません",
    );
    expect(fixture.request.mock.calls.every(([, method]) => !method || method === "GET")).toBe(
      true,
    );
  });

  test("他applicationに共有されたpolicyは削除しない", async () => {
    const fixture = accessFixture();
    fixture.existing();
    fixture.policy.app_count = 2;
    await expect(syncPosWebhookAccess(target, false, fixture.request)).rejects.toThrow(
      "所有範囲と一致しません",
    );
    expect(fixture.request.mock.calls.some(([, method]) => method === "DELETE")).toBe(false);
  });

  test("PR本体の保護が確認できない場合は公開例外を作らない", async () => {
    const fixture = accessFixture();
    fixture.root.policies = [];
    await expect(syncPosWebhookAccess(target, true, fixture.request)).rejects.toThrow(
      "本体のAccess保護を確認できません",
    );
    expect(fixture.request.mock.calls.some(([, method]) => method === "POST")).toBe(false);
  });
});

describe("Square Webhookの公開後検査", () => {
  test("未署名要求はAPIが拒否し、他APIは引き続きAccessログインへ戻す", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: { code: "POS_WEBHOOK_SIGNATURE" } }, { status: 403 }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://tablecast.cloudflareaccess.com/cdn-cgi/access/login" },
        }),
      );
    await expect(verifyPosWebhookAccess(target.origin, request)).resolves.toBeUndefined();
    expect(
      request.mock.calls.map(([url]) =>
        url instanceof Request ? url.url : url instanceof URL ? url.href : url,
      ),
    ).toEqual([`${target.origin}/api/pos/square/webhook`, `${target.origin}/api/health`]);
    expect(request.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true);
  });

  test("WebhookがAccessに遮られたままのHTML応答を成功としない", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Access login", { status: 302 }));
    await expect(verifyPosWebhookAccess(target.origin, request)).rejects.toThrow(
      "署名検証へ到達して拒否されることを確認できません",
    );
  });

  test("他APIまで一般公開された場合は検査を失敗させる", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: { code: "POS_WEBHOOK_SIGNATURE" } }, { status: 403 }),
      )
      .mockResolvedValueOnce(Response.json({ releaseSha: "test" }));
    await expect(verifyPosWebhookAccess(target.origin, request)).rejects.toThrow(
      "Webhook以外のPRプレビューのAccess保護を確認できません",
    );
  });
});
