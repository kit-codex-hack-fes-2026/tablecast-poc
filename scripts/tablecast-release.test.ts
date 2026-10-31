import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { tablecastRepository } from "./tablecast-deploy-config.ts";
import {
  changeSummary,
  type ReleaseChange,
  releaseChanges,
  renderRelease,
  supplementMergedPulls,
  validReleaseHead,
  validReleaseSource,
} from "./tablecast-release.ts";
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
  test.each([
    { owner: 273, numbers: [273, 276] },
    { owner: 252, numbers: [252, 253, 254, 255, 256] },
  ])(
    "共有mergeのStack $numbersを補完し、元commitの所有を保つ",
    ({ owner: ownerNumber, numbers }) => {
      const owner = pull(ownerNumber);
      const source = [
        { sha: previousHead, message: "元commit", pulls: [owner] },
        { sha: head, message: "Stackを統合", pulls: [owner] },
      ];
      const supplemented = supplementMergedPulls(
        source,
        numbers.map((number) => ({
          ...pull(number),
          base: { ref: "codex/stack-base", sha: base },
        })),
      );
      const result = releaseChanges(supplemented);
      expect(result.pulls.map((pr) => pr.number)).toEqual(numbers);
      expect(result.unmatched).toEqual([]);
      expect(supplemented[0]?.pulls).toEqual([owner]);
      expect(source[1]?.pulls).toEqual([owner]);
    },
  );
  test("補完候補の未マージ・別repo・release・差分外を除外する", () => {
    const supplemented = supplementMergedPulls(changes, [
      { ...pull(2), merged_at: null },
      { ...pull(3), head: { ...pull(3).head, repo: { full_name: "other/repository" } } },
      { ...pull(4), head: { ...pull(4).head, ref: "staging" } },
      pull(5, previousHead),
      pull(6),
    ]);
    const result = releaseChanges(supplemented);
    expect(result.pulls.map((pr) => pr.number)).toEqual([1, 6]);
    expect(result.unmatched).toEqual([]);
    expect(
      releaseChanges([
        ...supplemented,
        { sha: "d".repeat(40), message: `This reverts commit ${head}.`, pulls: [] },
      ]).revertedPulls,
    ).toEqual([1, 6]);
  });
  test("補完した共有mergeの全段をrevertで取り消し、再revertで復帰する", () => {
    const closed = [pull(273), pull(276)];
    const source = [
      { sha: previousHead, message: "元commit", pulls: [pull(273)] },
      { sha: head, message: "Stackを統合", pulls: [pull(273)] },
      { sha: "d".repeat(40), message: `This reverts commit ${head}.`, pulls: [] },
    ];
    const reverted = releaseChanges(supplementMergedPulls(source, closed));
    expect(reverted.pulls).toEqual([]);
    expect(reverted.revertedPulls).toEqual([273, 276]);
    expect(
      releaseChanges(
        supplementMergedPulls(
          [
            ...source,
            { sha: "e".repeat(40), message: `This reverts commit ${"d".repeat(40)}.`, pulls: [] },
          ],
          closed,
        ),
      ).pulls.map((pr) => pr.number),
    ).toEqual([273, 276]);
  });
  test("補完したStackで本文の確認を更新し、元PRの要約とIssueを反映する", () => {
    const first = renderRelease(input, "", template);
    const marker = /`(<!-- tablecast-release:reviewed:[a-f0-9]+ -->)`/.exec(first)?.[1];
    const reviewed = `${first}\n${marker}\n`;
    const nextInput = {
      ...input,
      changes: supplementMergedPulls(changes, [
        { ...pull(276), body: "## 変更内容\n\n配備を高速化する。\n\n## 関連Issue\nCloses #275" },
      ]),
    };
    const next = renderRelease(nextInput, reviewed, template);
    expect(next).toContain("[#276]");
    expect(next).toContain("配備を高速化する。");
    expect(next).toContain("参照 #275");
    expect(next).toContain("本文の更新確認待ち");
    expect(renderRelease(nextInput, next, template)).toBe(next);
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
      .replace("未記入。", "主な変更を手動で整理した。")
      .replace("未確認。", "既存データを保持して更新する。")
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
    expect(next).toContain("主な変更を手動で整理した。");
    expect(next).toContain("既存データを保持して更新する。");
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
