import { describe, expect, it } from "vitest";
import { selectTablecastTests, type TablecastChangedFile } from "./tablecast-test-selection.ts";

const modified = (filename: string): TablecastChangedFile => ({ filename, status: "modified" });
const all = {
  web: "full",
  components: "full",
  api: "full",
  runtime: "full",
  fixtures: "full",
  presentation: "full",
  e2e: "full",
  build: true,
};
const none = {
  web: "none",
  components: "none",
  api: "none",
  runtime: "none",
  fixtures: "none",
  presentation: "none",
  e2e: "none",
  build: false,
};

describe("差分実行の前提", () => {
  it("PR以外と空の比較結果を全実行へ戻す", () => {
    expect(selectTablecastTests([modified("docs/testing.md")], "full")).toMatchObject(all);
    expect(selectTablecastTests([], "pull_request")).toMatchObject(all);
  });

  it.each([
    { filename: "apps/web/src/features/store/floor.tsx", status: "removed" },
    {
      filename: "docs/renamed.md",
      previous_filename: "apps/web/src/features/store/floor.tsx",
      status: "renamed",
    },
    { filename: "docs/testing.md", status: "copied" },
    { filename: "docs/testing.md", status: "" },
    { filename: "", status: "modified" },
    { filename: "docs/../apps/web/src/router.tsx", status: "modified" },
    { filename: "docs\\testing.md", status: "modified" },
    { filename: `docs/${String.fromCharCode(0)}.md`, status: "modified" },
    { filename: "/docs/testing.md", status: "modified" },
  ])("削除・移動・不正な比較入力を省略しない: $filename / $status", (file) => {
    expect(selectTablecastTests([file], "pull_request")).toMatchObject(all);
  });

  it.each([
    "bun.lock",
    "package.json",
    "turbo.json",
    "apps/web/vitest.config.ts",
    "apps/web/playwright.config.ts",
    "apps/web/tsconfig.json",
    "apps/presentation/package.json",
    ".github/actions/tablecast-setup/action.yml",
    "unknown/new-source.ts",
  ])("設定・依存・未知の変更を全実行へ戻す: %s", (path) => {
    expect(selectTablecastTests([modified(path)], "pull_request")).toMatchObject(all);
  });
});

describe("import graphで追えない境界", () => {
  it.each([
    "apps/api/src/modules/orders/routes.ts",
    "apps/api/src/db/business-schema.ts",
    "apps/api/migrations/0042-tablecast.sql",
    "apps/api/cloudflare.config.ts",
    "apps/api/test/timeline-legacy-migration.json",
    "scripts/tablecast-build.ts",
    "scripts/tablecast-seed-data.ts",
    "assets/demo/menu.json",
    "apps/emulate/src/index.ts",
    "apps/web/e2e/support/global-setup.ts",
    "apps/web/e2e/support/test.ts",
  ])("HTTP・DB・binding・ファイル読込・spawnの変更を落とさない: %s", (path) => {
    expect(selectTablecastTests([modified(path)], "pull_request")).toMatchObject(all);
  });

  it.each([
    "apps/web/src/routes/admin.stores.$storeId.tsx",
    "apps/web/src/router.tsx",
    "apps/web/src/server.ts",
    "apps/web/src/lib/api-fetch.server.ts",
    "apps/web/src/sw.ts",
    "apps/web/src/styles.css",
    "apps/web/messages/ja.json",
    "apps/web/project.inlang/settings.json",
    "apps/web/public/offline.html",
    "apps/web/.storybook/preview.tsx",
    "apps/web/src/routeTree.gen.ts",
  ])("Web共通・SSR・生成入力はWebと実E2Eを全実行する: %s", (path) => {
    expect(selectTablecastTests([modified(path)], "pull_request")).toMatchObject({
      ...none,
      web: "full",
      components: "full",
      runtime: "imports",
      e2e: "full",
      build: true,
    });
  });
});

describe("安全に絞れる変更", () => {
  it("純文書だけを省略し、製品pluginやビルド用画像を文書扱いしない", () => {
    expect(
      selectTablecastTests(
        [modified("docs/testing.md"), modified("docs/product.md")],
        "pull_request",
      ),
    ).toMatchObject(none);
    for (const path of [
      "plugins/tablecast/skills/tablecast/SKILL.md",
      ".agents/skills/fullstack-web-testing/SKILL.md",
      "AGENTS.md",
      "docs/AGENTS.md",
      "docs/design/logos/tablecast-logo.png",
    ])
      expect(selectTablecastTests([modified(path)], "pull_request")).toMatchObject(all);
  });

  it("Web単体テストだけならWebの関連テストへ絞る", () => {
    expect(
      selectTablecastTests(
        [{ filename: "apps/web/src/features/store/floor-model.test.ts", status: "added" }],
        "pull_request",
      ),
    ).toMatchObject({ ...none, web: "changed", runtime: "imports" });
  });

  it.each([
    "apps/web/src/features/store/floor-timeline.browser.test.tsx",
    "apps/web/src/components/button.stories.tsx",
  ])("Browserテスト・StoryだけならComponentの関連テストへ絞る: %s", (path) => {
    expect(
      selectTablecastTests([{ filename: path, status: "added" }], "pull_request"),
    ).toMatchObject({
      ...none,
      components: "changed",
      runtime: "imports",
    });
  });

  it("単体テストとBrowserテスト・Storyの混在では両方の関連テストを残す", () => {
    expect(
      selectTablecastTests(
        [
          modified("apps/web/src/features/store/floor-model.test.ts"),
          modified("apps/web/src/features/store/floor-timeline.browser.test.tsx"),
          modified("apps/web/src/components/button.stories.tsx"),
        ],
        "pull_request",
      ),
    ).toMatchObject({ ...none, web: "changed", components: "changed", runtime: "imports" });
  });

  it.each(["apps/web/src/features/store/floor.tsx", "apps/web/src/features/store/floor.test.tsx"])(
    "Web製品コード・未知のtest.tsxはHTTP越しのE2Eとbuildを残す: %s",
    (path) => {
      expect(selectTablecastTests([modified(path)], "pull_request")).toMatchObject({
        ...none,
        web: "changed",
        components: "changed",
        runtime: "imports",
        e2e: "full",
        build: true,
      });
    },
  );

  it("E2E specだけは変更したテストへ絞る", () => {
    expect(
      selectTablecastTests([modified("apps/web/e2e/tablecast-order.spec.ts")], "pull_request"),
    ).toMatchObject({ ...none, e2e: "changed" });
  });

  it("動画制作のコード・収録入力・手順は動画テストを残す", () => {
    expect(
      selectTablecastTests(
        [
          modified("apps/presentation/WORKFLOW.md"),
          modified("apps/presentation/projects/demo.json"),
        ],
        "pull_request",
      ),
    ).toMatchObject({ ...none, presentation: "full" });
  });

  it("混在する変更を合成し、差分指定で全実行へ戻した範囲を弱めない", () => {
    const files = [
      modified("apps/web/src/styles.css"),
      modified("docs/testing.md"),
      modified("apps/web/src/features/store/floor.tsx"),
      modified("apps/web/src/features/store/floor-model.test.ts"),
      modified("apps/web/src/features/store/floor-timeline.browser.test.tsx"),
      modified("apps/web/src/components/button.stories.tsx"),
      modified("apps/web/e2e/tablecast-order.spec.ts"),
      modified("apps/presentation/WORKFLOW.md"),
    ];
    const selection = selectTablecastTests(files, "pull_request");
    expect(selection).toMatchObject({
      ...none,
      web: "full",
      components: "full",
      runtime: "imports",
      presentation: "full",
      e2e: "full",
      build: true,
    });
    expect(selectTablecastTests(files.toReversed(), "pull_request")).toEqual(selection);
    expect(
      selectTablecastTests([...files, modified("apps/emulate/src/index.ts")], "pull_request"),
    ).toMatchObject(all);
    expect(selection.reason).not.toBe("");
  });
});
