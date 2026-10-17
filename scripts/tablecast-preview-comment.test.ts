import { describe, expect, test } from "vitest";
import {
  parseCatalogRequest,
  pendingCatalogRequests,
  previewCommentMarker,
  renderPreviewComment,
  resetCatalogRequest,
} from "./tablecast-preview-comment";

const sha = "a".repeat(40);
function comment(requested: ("storybook" | "email")[] = []) {
  return renderPreviewComment({
    pr: 276,
    sha,
    product: {
      url: "https://product.example.test",
      result: "success",
      served: sha,
      deployedAt: "2026-10-17T16:45:24.000Z",
    },
    catalogs: [
      {
        kind: "storybook",
        url: "https://storybook.example.test",
        served: "b".repeat(40),
        deployedAt: "2026-10-16T15:00:00.000Z",
      },
      { kind: "email", url: "https://email.example.test", served: "未確認（現在版不明）" },
    ],
    runUrl: "https://github.com/example/tablecast/actions/runs/1",
    requested,
  });
}

describe("PRコメントからの手動カタログ要求", () => {
  test("新規コメントのコマンドでは起動しない", () => {
    for (const body of [
      "/tablecast catalog",
      "/tablecast catalog storybook",
      "/tablecast catalog email",
      "/tablecast catalog all",
      comment(["storybook"]),
    ])
      expect(parseCatalogRequest({ action: "created", body, authorLogin: "operator" })).toBeNull();
  });

  test("botの同じSHAの通知で新たにチェックされた項目だけを選ぶ", () => {
    expect(
      parseCatalogRequest({
        action: "edited",
        before: comment(),
        body: comment(["storybook"]),
        authorLogin: "github-actions[bot]",
      }),
    ).toEqual({ catalog: "storybook", sha });
    expect(
      parseCatalogRequest({
        action: "edited",
        before: comment(["storybook"]),
        body: comment(["storybook", "email"]),
        authorLogin: "github-actions[bot]",
      }),
    ).toEqual({ catalog: "email", sha });
    expect(
      parseCatalogRequest({
        action: "edited",
        before: comment(),
        body: comment(["storybook", "email"]),
        authorLogin: "github-actions[bot]",
      }),
    ).toEqual({ catalog: "all", sha });
    expect(
      parseCatalogRequest({
        action: "edited",
        before: comment(["storybook"]),
        body: `${comment(["storybook"])}\n別の編集`,
        authorLogin: "github-actions[bot]",
      }),
    ).toBeNull();
    expect(
      parseCatalogRequest({
        action: "edited",
        before: comment(["storybook"]),
        body: comment(),
        authorLogin: "github-actions[bot]",
      }),
    ).toBeNull();
  });

  test("通知の偽装・SHA変更・旧本文なしを拒否する", () => {
    const body = comment(["storybook"]);
    for (const input of [
      { before: comment(), body, authorLogin: "operator" },
      {
        before: comment(),
        body: body.replace(previewCommentMarker, "other"),
        authorLogin: "github-actions[bot]",
      },
      {
        before: comment(),
        body: body.replace(sha, "c".repeat(40)),
        authorLogin: "github-actions[bot]",
      },
      { before: comment(), body: `${body}\n対象SHA: ${sha}`, authorLogin: "github-actions[bot]" },
      { body, authorLogin: "github-actions[bot]" },
    ])
      expect(parseCatalogRequest({ action: "edited", ...input })).toBeNull();
  });

  test("受付済みの項目だけ戻し、他の選択と現在の配備SHAを保持する", () => {
    const body = comment(["storybook", "email"]);
    const reset = resetCatalogRequest(body, "storybook");
    expect(pendingCatalogRequests(reset)).toEqual(["email"]);
    expect(reset).toContain("b".repeat(40));
    expect(reset).toContain("<td>—</td>");
    expect(pendingCatalogRequests(resetCatalogRequest(body, "all"))).toEqual([]);
  });

  test("正式名称・表内操作・実デプロイ日時を表示し、旧版と日時不明を区別する", () => {
    const body = comment();
    expect(body).toContain("📚 Storybook");
    expect(body).toContain("✉️ React Email");
    expect(body).not.toContain("メール");
    expect(body).not.toContain("/tablecast catalog");
    expect(body).toContain("<th>デプロイ日時 (JST)</th>");
    expect(body).toContain("2026-10-18 01:45");
    expect(body).toContain("2026-10-17 00:00");
    expect(body).toContain('🟢 <a href="https://github.com/example/tablecast/commit/' + sha);
    expect(body).toContain(
      '🟡 <a href="https://github.com/example/tablecast/commit/' + "b".repeat(40),
    );
    for (const kind of ["storybook", "email"]) {
      const row = body.split("<tr>").find((value) => value.includes(`request:${kind}`));
      expect(row).toContain("<td>\n\n- [ ] 🚀 **実行**");
      expect(row).toContain("</td></tr>");
    }
    expect(
      renderPreviewComment({
        pr: 276,
        sha,
        product: {
          url: 'https://example.test/?a=1&b="quoted"',
          result: "failure",
          served: "不明",
          deployedAt: "invalid",
        },
        catalogs: [],
        runUrl: "https://github.com/example/tablecast/actions/runs/1",
      }),
    ).toContain(
      'href="https://example.test/?a=1&amp;b=&quot;quoted&quot;">TableCast</a><br><sub>—</sub></td><td>❌ 失敗</td><td>—</td>',
    );
  });

  test("表示更新前のチェック要求も取り消し時に表示を壊さない", () => {
    const body = comment(["storybook"]).replace("🚀 **実行**", "Storybookを生成・配備する");
    expect(pendingCatalogRequests(body)).toEqual(["storybook"]);
    expect(resetCatalogRequest(body, "storybook")).toContain("- [ ] Storybookを生成・配備する");
  });
});
