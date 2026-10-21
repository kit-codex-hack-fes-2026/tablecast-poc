import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Pull, ReleaseChange } from "./model.ts";
import { deploymentTarget, tablecastRepository } from "../tablecast-deploy-config.ts";
import { pullSchema, shaSchema } from "./model.ts";

const exec = promisify(execFile);

export const prefix = `repos/${tablecastRepository}`;

export async function github(path: string, method = "GET", body?: unknown): Promise<unknown> {
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

export async function git(...args: string[]) {
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

export async function collect(base: string, head: string): Promise<ReleaseChange[]> {
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

export async function validation(head: string) {
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
