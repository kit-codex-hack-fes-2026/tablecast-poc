import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  type deploymentTarget,
  tablecastAccountId,
  tablecastRepository,
} from "./tablecast-deploy-config";
const execFileAsync = promisify(execFile);
const responseSchema = z.object({ success: z.boolean(), result: z.unknown() });

export async function cloudflare(
  path: string,
  method = "GET",
  body?: unknown,
  allowMissing = false,
) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKENをActions secretへ登録してください。");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${tablecastAccountId}/${path}`,
    {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (allowMissing && response.status === 404) return undefined;
  if (!response.ok)
    throw new Error(`Cloudflare ${method} ${path.split("?")[0]}: HTTP ${response.status}`);
  const data = responseSchema.parse(await response.json());
  if (!data.success) throw new Error(`Cloudflare ${method} ${path.split("?")[0]}に失敗しました。`);
  return data.result;
}

export async function currentRevision(
  target: ReturnType<typeof deploymentTarget>,
  sha: string,
  cleanup = false,
) {
  const gh = await execFileAsync("gh", [
    "api",
    target.pr
      ? `repos/${tablecastRepository}/pulls/${target.pr}`
      : `repos/${tablecastRepository}/commits/${target.branch}`,
  ]);
  const value: unknown = JSON.parse(gh.stdout);
  if (target.pr) {
    const pr = z
      .object({
        state: z.string(),
        head: z.object({ sha: z.string(), repo: z.object({ full_name: z.string() }) }),
      })
      .parse(value);
    if (
      pr.head.repo.full_name !== tablecastRepository ||
      pr.state !== (cleanup ? "closed" : "open") ||
      (!cleanup && pr.head.sha !== sha)
    )
      throw new Error("PRが更新・終了したか、同一リポジトリのPRではありません。");
  } else if (z.object({ sha: z.string() }).parse(value).sha !== sha) {
    throw new Error("配備対象branchが更新されました。新しいCIの配備に任せます。");
  }
}

export async function waitForRelease(
  origin: string,
  headers: Record<string, string>,
  releaseSha: string,
) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      const health = z.object({ releaseSha: z.string() }).safeParse(await response.json());
      if (response.ok && health.success && health.data.releaseSha === releaseSha) return;
      console.info(`配備の反映待ち ${attempt}/12: HTTP ${response.status}`);
    } catch {
      // 一時的な接続失敗やHTML応答は再試行し、資格を含み得る応答本文は出さない。
      console.info(`配備の反映待ち ${attempt}/12: healthを取得できません。`);
    }
    if (attempt < 12) await new Promise((complete) => setTimeout(complete, 5_000));
  }
  throw new Error("配備先のrelease SHAを期限内に確認できません。");
}
