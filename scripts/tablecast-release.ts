import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { tablecastRepository, deploymentTarget } from "./tablecast-deploy-config";

const exec = promisify(execFile);
const prefix = `repos/${tablecastRepository}`;
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const pullSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.string().url(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  head: z.object({
    sha: shaSchema,
    ref: z.string(),
    repo: z.object({ full_name: z.string() }).nullable(),
  }),
  base: z.object({ ref: z.string(), sha: shaSchema }),
});
type Pull = z.infer<typeof pullSchema>;
export type ReleaseChange = { sha: string; message: string; pulls: Pull[] };
export type ReleaseInput = {
  base: string;
  head: string;
  changes: ReleaseChange[];
  validation: string;
};

async function github(path: string, method = "GET", body?: unknown): Promise<unknown> {
  // stdinでJSONを渡し、本文やtokenをshell構文として扱わない。
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "gh",
      [
        "api",
        path,
        "--method",
        method,
        ...(body === undefined ? ["--paginate", "--slurp"] : ["--input", "-"]),
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`GitHub ${method} ${path.split("?")[0]}に失敗しました。`));
      else {
        try {
          const data: unknown = JSON.parse(output);
          resolve(body === undefined && Array.isArray(data) ? data.flat() : data);
        } catch {
          reject(new Error("GitHub応答が不正です。"));
        }
      }
    });
    child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function git(...args: string[]) {
  return (await exec("git", args)).stdout.trim();
}
const clean = (value: string) => value.replace(/<!--[^]*?-->/g, "").trim();
const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
export function changeSummary(body: string | null) {
  const section = clean(body ?? "")
    .split(/^## 変更内容\s*$/m)[1]
    ?.split(/^## /m)[0]
    ?.trim();
  return section?.split(/\n\s*\n/)[0]?.trim() || "変更内容の要約が未記入。元PRの差分を確認する。";
}

export function releaseChanges(changes: ReleaseChange[]) {
  const reverted = new Set<string>();
  // rev-listの逆順で、revertのrevertも取消として評価する。
  for (const change of [...changes].reverse()) {
    if (!reverted.has(change.sha)) {
      const target = /This reverts commit ([a-f0-9]{40})\b/.exec(change.message)?.[1];
      if (target) reverted.add(target);
    }
  }
  const commits = new Set(changes.map((change) => change.sha));
  const pulls = new Map<number, Pull>();
  const unmatched: ReleaseChange[] = [];
  const revertedPulls = new Set<number>();
  for (const change of changes) {
    for (const pull of change.pulls) {
      if (pull.merge_commit_sha && reverted.has(pull.merge_commit_sha))
        revertedPulls.add(pull.number);
    }
  }
  for (const change of changes) {
    if (reverted.has(change.sha)) continue;
    const included = change.pulls.filter(
      (pr) =>
        pr.merged_at &&
        pr.head.ref !== "staging" &&
        pr.head.repo?.full_name === tablecastRepository &&
        pr.merge_commit_sha &&
        commits.has(pr.merge_commit_sha),
    );
    for (const pull of included) if (!revertedPulls.has(pull.number)) pulls.set(pull.number, pull);
    if (!included.length) unmatched.push(change);
  }
  return {
    pulls: [...pulls.values()].sort((a, b) => a.number - b.number),
    unmatched,
    revertedPulls: [...revertedPulls],
  };
}

function replaceBlock(body: string, name: string, content: string) {
  const begin = `<!-- tablecast-release:${name}:start -->`;
  const end = `<!-- tablecast-release:${name}:end -->`;
  const first = body.indexOf(begin),
    last = body.indexOf(end);
  if (
    first < 0 ||
    last < first ||
    body.indexOf(begin, first + 1) !== -1 ||
    body.indexOf(end, last + 1) !== -1
  )
    throw new Error(`release本文の${name}領域が不正です。手動編集を確認してください。`);
  return body.slice(0, first + begin.length) + `\n${content}\n` + body.slice(last);
}

export function renderRelease(input: ReleaseInput, previous: string, template: string) {
  const { pulls, unmatched, revertedPulls } = releaseChanges(input.changes);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        base: input.base,
        head: input.head,
        pulls: pulls.map((pr) => [pr.number, pr.title, pr.body]),
        unmatched: unmatched.map((c) => c.sha),
        revertedPulls,
      }),
    )
    .digest("hex");
  let body = previous || template;
  const reviewed = body.split("\n").includes(`<!-- tablecast-release:reviewed:${fingerprint} -->`);
  body = replaceBlock(
    body,
    "status",
    `${reviewed ? "本文確認済み" : "本文の更新確認待ち：概要・主な変更・移行手順を現在の差分と照合する。"}\n\n確認後に記載する識別子：\n\`<!-- tablecast-release:reviewed:${fingerprint} -->\``,
  );
  const rows = pulls.map(
    (pr) =>
      `| [#${pr.number}](${pr.html_url}) | ${cell(pr.title)} | ${cell(changeSummary(pr.body))} |`,
  );
  const extra = unmatched.map(
    (c) =>
      `- [${c.sha.slice(0, 7)}](https://github.com/${tablecastRepository}/commit/${c.sha}): ${cell(c.message.split("\n")[0] ?? "")}`,
  );
  body = replaceBlock(
    body,
    "pulls",
    [
      "| PR | タイトル | 変更の要約 |",
      "| --- | --- | --- |",
      ...rows,
      ...(extra.length ? ["", "PRに紐付かない変更：", ...extra] : []),
      ...(revertedPulls.length
        ? [
            "",
            `取り消されたPR（変更一覧から除外）：${revertedPulls.map((n) => `#${n}`).join("、")}`,
          ]
        : []),
    ].join("\n"),
  );
  body = replaceBlock(
    body,
    "validation",
    `比較：[main → staging](https://github.com/${tablecastRepository}/compare/${input.base}...${input.head})\n\n- main SHA: ${input.base}\n- release head SHA: ${input.head}\n- staging: ${deploymentTarget(undefined, "staging").origin}\n${input.validation}\n\nremote MCPの実クライアント確認は、下の手動記入欄へ対象SHA・クライアント・結果を記録する。`,
  );
  const issues = [
    ...new Set(
      pulls.flatMap((pr) =>
        [
          ...(pr.body ?? "").matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#([0-9]+)/gi),
        ].map((m) => Number(m[1])),
      ),
    ),
  ].sort((a, b) => a - b);
  return replaceBlock(
    body,
    "issues",
    issues.length ? issues.map((n) => `- 参照 #${n}`).join("\n") : "関連Issueは元PRを参照する。",
  );
}

async function collect(base: string, head: string): Promise<ReleaseChange[]> {
  const commits = (await git("rev-list", "--reverse", `${base}..${head}`))
    .split("\n")
    .filter(Boolean);
  const changes: ReleaseChange[] = [];
  for (const sha of commits) {
    const pulls = z
      .array(pullSchema)
      .parse(await github(`${prefix}/commits/${sha}/pulls?per_page=100`));
    changes.push({ sha, message: await git("show", "-s", "--format=%B", sha), pulls });
  }
  return changes;
}
async function validation(head: string) {
  const runs = z
    .array(
      z.object({
        workflow_runs: z.array(
          z.object({
            id: z.number(),
            event: z.string(),
            head_sha: z.string(),
            head_branch: z.string(),
            status: z.string(),
            conclusion: z.string().nullable(),
            html_url: z.string(),
          }),
        ),
      }),
    )
    .parse(
      await github(
        `${prefix}/actions/workflows/ci.yml/runs?branch=staging&head_sha=${head}&per_page=100`,
      ),
    )
    .flatMap((page) => page.workflow_runs);
  const run = runs.find(
    (r) =>
      r.head_sha === head &&
      r.head_branch === "staging" &&
      ["push", "workflow_dispatch"].includes(r.event),
  );
  let served = "未確認";
  try {
    const response = await fetch(`${deploymentTarget(undefined, "staging").origin}/api/health`, {
      headers: {
        "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID ?? "",
        "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET ?? "",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (response.ok)
      served = z.object({ releaseSha: shaSchema }).parse(await response.json()).releaseSha;
  } catch {
    /* 到達できない配備版を前回の成功から推測しない。 */
  }
  return {
    run,
    served,
    text: `- staging CI: ${run ? `[${run.conclusion ?? run.status}](${run.html_url})` : "未実行"}\n- 疎通で確認した配備SHA: ${served}`,
  };
}

export function validReleaseSource(pr: {
  base: { ref: string };
  head: { ref: string; repo: { full_name: string } | null };
}) {
  return (
    pr.base.ref !== "main" ||
    (pr.head.ref === "staging" && pr.head.repo?.full_name === tablecastRepository)
  );
}

export function validReleaseHead(pulls: Pull[], base: string, head: string) {
  return (
    pulls.length === 1 &&
    pulls.every(
      (pr) =>
        pr.base.ref === "main" &&
        validReleaseSource(pr) &&
        pr.head.sha === head &&
        pr.base.sha === base,
    )
  );
}

async function main() {
  const base = shaSchema.parse(await git("rev-parse", "origin/main"));
  const head = shaSchema.parse(await git("rev-parse", "origin/staging"));
  const state = await validation(head);
  if (process.argv.includes("--gate")) {
    const pulls = z
      .array(pullSchema)
      .parse(await github(`${prefix}/pulls?state=open&base=main&per_page=100`));
    let sameTree = false;
    try {
      sameTree =
        (await git("merge-tree", "--write-tree", base, head)) ===
        (await git("rev-parse", `${head}^{tree}`));
    } catch {
      /* conflictは拒否する。 */
    }
    for (const sha of new Set(pulls.map((pr) => pr.head.sha))) {
      const permitted = validReleaseHead(
        pulls.filter((pr) => pr.head.sha === sha),
        base,
        head,
      );
      const ready =
        permitted && sameTree && state.served === head && state.run?.conclusion === "success";
      await github(`${prefix}/statuses/${sha}`, "POST", {
        state: ready ? "success" : "failure",
        context: "TableCast release",
        description: ready
          ? "最新stagingのCI・配備・統合内容を確認済み"
          : "同一repoの最新staging・CI・配備・統合内容を確認してください",
      });
    }
    return;
  }
  const open = z
    .array(pullSchema)
    .parse(
      await github(
        `${prefix}/pulls?state=open&base=main&head=kit-codex-hack-fes-2026:staging&per_page=100`,
      ),
    );
  if (open.length > 1) throw new Error("release PRが重複しています。");
  if (!(await git("diff", "--name-only", base, head))) {
    if (open[0]) await github(`${prefix}/pulls/${open[0].number}`, "PATCH", { state: "closed" });
    return;
  }
  const template = await readFile(
    new URL("../.github/release_pull_request_template.md", import.meta.url),
    "utf8",
  );
  const changes = await collect(base, head);
  // 読取り中にbranchが動いたら次の実行へ任せる。
  for (const [branch, expected] of [
    ["main", base],
    ["staging", head],
  ]) {
    const [current] = z
      .array(z.object({ sha: shaSchema }))
      .parse(await github(`${prefix}/commits/${branch}`));
    if (current?.sha !== expected)
      throw new Error("集約中にbranchが更新されました。再実行してください。");
  }
  // 元PRの収集後に本文を読み直し、その間の手動編集も保持する。
  const current = open[0]
    ? z.array(pullSchema).parse(await github(`${prefix}/pulls/${open[0].number}`))[0]
    : undefined;
  const body = renderRelease(
    { base, head, changes, validation: state.text },
    current?.body ?? "",
    template,
  );
  if (open[0]) {
    if (body !== current?.body)
      await github(`${prefix}/pulls/${open[0].number}`, "PATCH", { body });
  } else {
    await github(`${prefix}/pulls`, "POST", {
      base: "main",
      head: "staging",
      draft: true,
      title: "stagingの変更を本番へリリースする",
      body,
    });
  }
}
if (import.meta.main) await main();
