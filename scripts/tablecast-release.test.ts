import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
  changeSummary,
  releaseChanges,
  renderRelease,
  validReleaseSource,
  validReleaseHead,
  type ReleaseChange,
} from "./tablecast-release";
import { tablecastRepository } from "./tablecast-deploy-config";
const base = "a".repeat(40),
  head = "b".repeat(40),
  previousHead = "c".repeat(40);
const template = await readFile(
  new URL("../.github/release_pull_request_template.md", import.meta.url),
  "utf8",
);
const pull = (number: number, sha = head) => ({
  number,
  title: `変更${number}`,
  body: "## 変更内容\n\n接続後の設定を保存できる。\n\n詳細。\n\n## 関連Issue\nCloses #189",
  html_url: `https://github.com/${tablecastRepository}/pull/${number}`,
  merged_at: "2026-09-14",
  merge_commit_sha: sha,
  head: { sha, ref: "codex/189-test", repo: { full_name: tablecastRepository } },
  base: { ref: "staging", sha: base },
});
const changes: ReleaseChange[] = [{ sha: head, message: "feat: 保存", pulls: [pull(1)] }];
const input = { base, head, changes, validation: "- staging CI: 未実行" };

describe("release本文", () => {
  test("変更内容の先頭段落を使い、未記入の要約を推測しない", () => {
    expect(changeSummary(pull(1).body)).toBe("接続後の設定を保存できる。");
    expect(changeSummary("## 変更内容\n<!-- 記入例 -->\n## テスト\n成功")).toContain("未記入");
  });
  test("同じPRを重複させず、閉じただけのPRと過去のrelease PRを含めない", () => {
    const result = releaseChanges([
      ...changes,
      {
        sha: previousHead,
        message: "追加",
        pulls: [
          pull(1),
          { ...pull(2), merged_at: null },
          { ...pull(3), head: { ...pull(3).head, ref: "staging" } },
        ],
      },
    ]);
    expect(result.pulls.map((pr) => pr.number)).toEqual([1]);
  });
  test("mainとの差分外のmerge commitに属するPRを含めず、直接commitを残す", () => {
    const result = releaseChanges([
      { sha: head, message: "直接の修正", pulls: [pull(2, previousHead)] },
    ]);
    expect(result.pulls).toEqual([]);
    expect(result.unmatched.map((change) => change.sha)).toEqual([head]);
  });
  test("取り消されたPRを新機能として列挙せず、revertのrevertでは復帰する", () => {
    const reverted = [
      ...changes,
      { sha: previousHead, message: `Revert\nThis reverts commit ${head}.`, pulls: [] },
    ];
    expect(releaseChanges(reverted).pulls).toEqual([]);
    expect(
      releaseChanges([
        ...reverted,
        { sha: "d".repeat(40), message: `This reverts commit ${previousHead}.`, pulls: [] },
      ]).pulls.map((pr) => pr.number),
    ).toEqual([1]);
  });
  test("関連PRを更新しても概要・手動確認を保持し、同じ入力では本文が変わらない", () => {
    const first = renderRelease(input, "", template)
      .replace("未記入。", "接続設定を保持できるようにした。")
      .replace("未実施。", "Codexから確認した。");
    const next = renderRelease(
      {
        ...input,
        changes: [
          ...changes,
          { sha: previousHead, message: "修正", pulls: [pull(2, previousHead)] },
        ],
      },
      first,
      template,
    );
    expect(next).toContain("接続設定を保持できるようにした。");
    expect(next).toContain("Codexから確認した。");
    expect(next).toContain("[#2]");
    expect(next).not.toContain("Closes #189");
    expect(renderRelease(input, first, template)).toBe(first);
  });
  test("コード例は確認済みにならず、明示マーカーは現在の対象だけに有効", () => {
    const first = renderRelease(input, "", template);
    expect(renderRelease(input, first, template)).toContain("本文の更新確認待ち");
    const marker = /`(<!-- tablecast-release:reviewed:[a-f0-9]+ -->)`/.exec(first)?.[1];
    const reviewed = `${first}\n${marker}\n`;
    expect(renderRelease(input, reviewed, template)).toContain("本文確認済み");
    expect(renderRelease({ ...input, head: previousHead }, reviewed, template)).toContain(
      "本文の更新確認待ち",
    );
    expect(
      renderRelease(
        {
          ...input,
          changes: [{ sha: head, message: "更新", pulls: [{ ...pull(1), body: "更新した本文" }] }],
        },
        reviewed,
        template,
      ),
    ).toContain("本文の更新確認待ち");
  });
  test("自動領域を削除した本文を勝手に置き換えない", () => {
    expect(() => renderRelease(input, "手動で書き直した本文", template)).toThrow("領域が不正");
  });
});

test("mainには同一repoのstagingだけを許可する", () => {
  const pr = {
    base: { ref: "main" },
    head: { ref: "staging", repo: { full_name: tablecastRepository } },
  };
  expect(validReleaseSource(pr)).toBe(true);
  expect(validReleaseSource({ ...pr, head: { ...pr.head, ref: "codex/test" } })).toBe(false);
  expect(
    validReleaseSource({ ...pr, head: { ...pr.head, repo: { full_name: "fork/tablecast-poc" } } }),
  ).toBe(false);
});

test("同じheadのrelease PRが重複した場合はマージ判定も拒否する", () => {
  const pr = {
    ...pull(1),
    base: { ref: "main", sha: base },
    head: { ...pull(1).head, ref: "staging" },
  };
  expect(validReleaseHead([pr], base, head)).toBe(true);
  expect(validReleaseHead([], base, head)).toBe(false);
  expect(validReleaseHead([pr, { ...pr, number: 2 }], base, head)).toBe(false);
  expect(validReleaseHead([pr], base, previousHead)).toBe(false);
});
