import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { deploymentTarget, tablecastRepository } from "./tablecast-deploy-config.ts";
import { renderRelease } from "./tablecast-release/render.ts";

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

export type Pull = z.infer<typeof pullSchema>;

export type ReleaseChange = { message: string; pulls: Pull[]; sha: string };

export type ReleaseInput = {
  base: string;
  changes: ReleaseChange[];
  head: string;
  validation: string;
};

const exec = promisify(execFile);

const prefix = `repos/${tablecastRepository}`;

async function github(path: string, method = "GET", body?: unknown): Promise<unknown> {
  let stdout: string;
  try {
    // stdinでJSONを渡し、本文やtokenをshell構文として扱わない。
    const request = exec(
      "gh",
      [
        "api",
        path,
        "--method",
        method,
        ...(body === undefined ? ["--paginate", "--slurp"] : ["--input", "-"]),
      ],
      { maxBuffer: Infinity },
    );
    request.child.stdin?.end(body === undefined ? undefined : JSON.stringify(body));
    ({ stdout } = await request);
  } catch {
    throw new Error(`GitHub ${method} ${path.split("?")[0]}に失敗しました。`);
  }
  try {
    const data: unknown = JSON.parse(stdout);
    return body === undefined && Array.isArray(data) ? data.flat() : data;
  } catch {
    throw new Error("GitHub応答が不正です。");
  }
}

async function git(...args: string[]) {
  return (await exec("git", args)).stdout.trim();
}

export function supplementMergedPulls(changes: ReleaseChange[], closed: Pull[]): ReleaseChange[] {
  return changes.map((change) => {
    const pulls = new Map(change.pulls.map((pull) => [pull.number, pull]));
    for (const pull of closed) {
      if (
        pull.merged_at &&
        pull.head.repo?.full_name === tablecastRepository &&
        pull.head.ref !== "staging" &&
        pull.merge_commit_sha === change.sha &&
        !pulls.has(pull.number)
      )
        pulls.set(pull.number, pull);
    }
    return { ...change, pulls: [...pulls.values()] };
  });
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
  // Stackの全段が同じmerge SHAを持っても、commit関連PR APIは下段だけを返す場合がある。
  const closed = z
    .array(pullSchema)
    .parse(await github(`${prefix}/pulls?state=closed&per_page=100`));
  return supplementMergedPulls(changes, closed);
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
  head: { ref: string; repo: null | { full_name: string } };
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

export { changeSummary, releaseChanges, renderRelease } from "./tablecast-release/render.ts";
