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
    product: { url: "https://product.example.test", result: "success", served: sha },
    catalogs: [
      { kind: "storybook", url: "https://storybook.example.test", served: "b".repeat(40) },
      { kind: "email", url: "https://email.example.test", served: "未確認（現在版不明）" },
    ],
    runUrl: "https://github.com/example/tablecast/actions/runs/1",
    requested,
  });
}

describe("PRコメントからの手動カタログ要求", () => {
  test("完全一致のコマンドだけを受け付け、botとshell断片を拒否する", () => {
    for (const catalog of ["storybook", "email", "all"] as const)
      expect(
        parseCatalogRequest({
          action: "created",
          body: `/tablecast catalog ${catalog}`,
          authorLogin: "operator",
        }),
      ).toEqual({ catalog });
    expect(
      parseCatalogRequest({
        action: "created",
        body: "/tablecast catalog",
        authorLogin: "operator",
      }),
    ).toEqual({ catalog: "all" });
    for (const body of [
      "prefix /tablecast catalog all",
      "/tablecast catalog email; echo secret",
      "/tablecast catalog all\ncommand",
    ])
      expect(parseCatalogRequest({ action: "created", body, authorLogin: "operator" })).toBeNull();
    expect(
      parseCatalogRequest({
        action: "created",
        body: "/tablecast catalog all",
        authorLogin: "github-actions[bot]",
      }),
    ).toBeNull();
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
    expect(reset).toContain("未確認（現在版不明）");
    expect(pendingCatalogRequests(resetCatalogRequest(body, "all"))).toEqual([]);
  });
});
