import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { evaluationCases, evaluationConfiguration, evaluationRequest } from "./tablecast-eval.ts";
import { worktreeId } from "./tablecast-observability-config.ts";

it("worktreeの識別子はbranch・commitに依存せず別checkoutと区別し実パスを出さない", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tablecast-observability-")));
  try {
    const a = join(root, "a");
    const b = join(root, "b");
    await mkdir(a);
    await mkdir(b);
    await promisify(execFile)("git", ["init", "--quiet", a]);
    const id = await worktreeId(a);
    await writeFile(join(a, "test.txt"), "作業内容");
    await promisify(execFile)("git", [
      "-C",
      a,
      "symbolic-ref",
      "HEAD",
      "refs/heads/codex/424-other",
    ]);
    await symlink(a, join(root, "alias"));
    expect(await worktreeId(a)).toBe(id);
    expect(await worktreeId(join(root, "alias"))).toBe(id);
    expect(await worktreeId(b)).not.toBe(id);
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("評価は本番prompt生成と記録済みtool定義を使いsnapshotの言語を検査する", () => {
  const data = evaluationCases.parse([
    {
      id: "tablecast-case",
      input: { locale: "ja", messages: [{ role: "user", content: "お茶" }] },
      expectedOutput: "確認する",
      metadata: {
        caseId: "tablecast-case",
        scenario: "confirmation",
        provenance: "synthetic-draft",
      },
    },
  ]);
  const item = data[0];
  if (!item) throw new Error("評価caseがありません。");
  const config = evaluationConfiguration.parse({
    locale: "ja",
    storeInstructions: "店舗の参照情報",
    responses: {
      model: "gpt-6.1-terra",
      tools: [
        {
          type: "function",
          name: "getCatalog",
          description: "登録情報を取得",
          parameters: { type: "object" },
          strict: false,
        },
      ],
    },
  });
  const request = evaluationRequest(config, item, 512);
  expect(request.instructions).toContain("同じ客発話でprepareConfirmationとsubmitOrderを呼ばない");
  expect(request.instructions).toContain("店舗の参照情報");
  expect(request.tools).toEqual(config.responses.tools);
  expect(request).toMatchObject({
    store: false,
    max_output_tokens: 512,
    max_tool_calls: 4,
    reasoning: { effort: "low" },
  });
  expect(() => evaluationRequest({ ...config, locale: "en" }, item, 512)).toThrow("言語");
});
