import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  collect,
  git,
  github,
  prefix,
  validation,
  validReleaseHead,
} from "./tablecast-release/collect.ts";
import { pullSchema, shaSchema } from "./tablecast-release/model.ts";
import { renderRelease } from "./tablecast-release/render.ts";

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

export {
  supplementMergedPulls,
  validReleaseHead,
  validReleaseSource,
} from "./tablecast-release/collect.ts";
export type { ReleaseChange } from "./tablecast-release/model.ts";
export { changeSummary, releaseChanges, renderRelease } from "./tablecast-release/render.ts";
