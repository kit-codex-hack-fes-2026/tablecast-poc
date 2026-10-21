import { createHash } from "node:crypto";
import type { Pull, ReleaseChange, ReleaseInput } from "../tablecast-release.ts";
import { deploymentTarget, tablecastRepository } from "../tablecast-deploy-config.ts";

const clean = (value: string) => value.replace(/<!--[^]*?-->/g, "").trim();

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function changeSummary(body: null | string) {
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
