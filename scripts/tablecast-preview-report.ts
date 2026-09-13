import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { catalogKinds, catalogTarget } from "./tablecast-catalog-config";
import { inspectCatalog } from "./tablecast-catalog-deploy";
import { currentRevision } from "./tablecast-deploy-api";
import { deploymentTarget, tablecastRepository } from "./tablecast-deploy-config";

const exec = promisify(execFile);
export const catalogCommentMarker = "<!-- tablecast-catalog-preview -->";
export function catalogReport(
  pr: string,
  sha: string,
  result: string,
  served: Record<string, string>,
  run: string,
) {
  return `${catalogCommentMarker}\nカタログプレビュー（Cloudflare Accessへのログインが必要）\n\n対象SHA: ${sha}\n\n今回の結果: ${result}\n\n| カタログ | URL | 最後に確認できた配備SHA |\n| --- | --- | --- |\n${catalogKinds.map((kind) => `| ${kind} | ${catalogTarget(pr, kind).origin} | ${served[kind] ?? "未確認（現在版不明）"} |`).join("\n")}\n\n[実行結果](${run})\n`;
}
async function main() {
  const pr = z
    .string()
    .regex(/^[1-9]\d{0,8}$/)
    .parse(process.env.TABLECAST_PR_NUMBER);
  const sha = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.TABLECAST_RELEASE_SHA);
  const target = deploymentTarget(pr);
  await currentRevision(target, sha);
  const served: Record<string, string> = {};
  for (const kind of catalogKinds) {
    try {
      served[kind] = (await inspectCatalog(catalogTarget(pr, kind).origin, pr, kind)).sha;
    } catch {
      /* 確認できない現在版を旧SHAで推測しない。 */
    }
  }
  const jobs = z
    .record(z.string(), z.object({ result: z.string() }))
    .parse(JSON.parse(process.env.TABLECAST_CATALOG_RESULTS || "{}"));
  const result =
    `deploy: ${process.env.TABLECAST_CATALOG_DEPLOY_RESULT ?? "unknown"}; ` +
    Object.entries(jobs)
      .map(([job, value]) => `${job}: ${value.result}`)
      .join(", ");
  const run = `https://github.com/${tablecastRepository}/actions/runs/${z.string().regex(/^\d+$/).parse(process.env.GITHUB_RUN_ID)}`;
  const body = catalogReport(pr, sha, result, served, run);
  if (process.env.GITHUB_STEP_SUMMARY)
    await writeFile(process.env.GITHUB_STEP_SUMMARY, body, { flag: "a" });
  const response = await exec("gh", [
    "api",
    "--paginate",
    "--slurp",
    `repos/${tablecastRepository}/issues/${pr}/comments`,
  ]);
  const pages = z
    .array(
      z.array(
        z.object({ id: z.number(), body: z.string(), user: z.object({ login: z.string() }) }),
      ),
    )
    .parse(JSON.parse(response.stdout));
  const comments = pages
    .flat()
    .filter(
      (comment) =>
        comment.user.login === "github-actions[bot]" &&
        comment.body.startsWith(catalogCommentMarker),
    );
  if (comments.length > 1) throw new Error("カタログ通知が重複しています。自動投稿を停止します。");
  await currentRevision(target, sha);
  const directory = resolve(import.meta.dirname, "../.local/tablecast-catalog");
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, "comment.json");
  await writeFile(file, JSON.stringify({ body }));
  const path = comments[0]
    ? `repos/${tablecastRepository}/issues/comments/${comments[0].id}`
    : `repos/${tablecastRepository}/issues/${pr}/comments`;
  await exec("gh", ["api", path, "--method", comments[0] ? "PATCH" : "POST", "--input", file]);
}
if (import.meta.main) {
  try {
    await main();
  } catch {
    console.error("カタログ通知を更新できません。古いrun・PR状態・権限を確認してください。");
    process.exitCode = 1;
  }
}
