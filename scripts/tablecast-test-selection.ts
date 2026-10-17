export type TablecastChangedFile = {
  filename: string;
  status: string;
  previous_filename?: string;
};

export type TablecastTestMode = "pull_request" | "full";
type TestScope = "full" | "changed" | "none";

export type TablecastTestSelection = {
  web: TestScope;
  components: TestScope;
  api: "full" | "none";
  runtime: "full" | "imports" | "none";
  fixtures: "full" | "none";
  presentation: "full" | "none";
  e2e: TestScope;
  build: boolean;
  images: boolean;
  reason: string;
};

function fullSelection(reason: string): TablecastTestSelection {
  return {
    web: "full",
    components: "full",
    api: "full",
    runtime: "full",
    fixtures: "full",
    presentation: "full",
    e2e: "full",
    build: true,
    images: true,
    reason,
  };
}

// HTTP・binding・子プロセスの依存をimport graphで推測せず、既知の範囲だけ絞る。
export function selectTablecastTests(
  files: readonly TablecastChangedFile[],
  eventMode: TablecastTestMode,
): TablecastTestSelection {
  if (eventMode !== "pull_request") return fullSelection("PR差分実行の対象外");
  if (!files.length) return fullSelection("比較対象のファイルが不明");

  const selection: TablecastTestSelection = {
    web: "none",
    components: "none",
    api: "none",
    runtime: "none",
    fixtures: "none",
    presentation: "none",
    e2e: "none",
    build: false,
    images: false,
    reason: "実行に影響しない文書のみ",
  };
  const reasons = new Set<string>();

  for (const file of files) {
    const path = file.filename;
    if (
      typeof path !== "string" ||
      !path ||
      path.includes("\\") ||
      path.split("").some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }) ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    )
      return fullSelection("ファイル名が不正");
    if (file.previous_filename !== undefined || !["added", "modified"].includes(file.status))
      return fullSelection("削除・移動または未知の変更種別");

    if (
      /(?:^|\/)(?:package(?:-lock)?\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|turbo\.jsonc?|tsconfig(?:\.[^/]+)?\.json|(?:[^/]+\.)?config\.[^/]+)$/.test(
        path,
      ) ||
      path.startsWith(".github/")
    )
      return fullSelection("実行設定または依存関係の変更");

    if (
      path.startsWith("docs/") &&
      path.endsWith(".md") &&
      !/(?:^|\/)(?:AGENTS\.md|SKILL\.md|\.agents|plugins)(?:\/|$)/.test(path)
    )
      continue;

    if (path.startsWith("apps/presentation/")) {
      selection.presentation = "full";
      reasons.add("動画制作の入力・コード");
      continue;
    }

    if (path.startsWith("apps/web/e2e/") && !path.startsWith("apps/web/e2e/support/")) {
      if (!path.endsWith(".spec.ts")) return fullSelection("E2Eの実行基盤または入力の変更");
      if (selection.e2e === "none") selection.e2e = "changed";
      reasons.add("E2Eテストの変更");
      continue;
    }

    if (/^apps\/web\/src\/.+\.test\.ts$/.test(path)) {
      if (selection.web === "none") selection.web = "changed";
      selection.runtime = "imports";
      reasons.add("Web単体テストの変更");
      continue;
    }

    if (/^apps\/web\/src\/.+\.(?:browser\.test|stories)\.tsx$/.test(path)) {
      if (selection.components === "none") selection.components = "changed";
      selection.runtime = "imports";
      reasons.add("Browserテスト・Storyの変更");
      continue;
    }

    const sharedWeb =
      /^apps\/web\/(?:messages|project\.inlang|public|\.storybook)\//.test(path) ||
      /^apps\/web\/src\/(?:routes|paraglide|i18n)\//.test(path) ||
      /^apps\/web\/src\/(?:router|server|sw|routeTree\.gen|entry[^/]*)\.[cm]?[jt]sx?$/.test(path) ||
      /^apps\/web\/src\/.+(?:\.css|\.server\.[cm]?[jt]sx?)$/.test(path);
    if (sharedWeb || /^apps\/web\/src\/.+\.tsx?$/.test(path)) {
      selection.web = sharedWeb ? "full" : selection.web === "full" ? "full" : "changed";
      selection.components = sharedWeb
        ? "full"
        : selection.components === "full"
          ? "full"
          : "changed";
      selection.e2e = "full";
      // import規則の実検査はWeb srcを複製し、別プロセスでresolverを起動する。
      selection.runtime = "imports";
      selection.build = true;
      // 配備は同じSHAのContainer artifactも必要とし、別SHAからは再利用しない。
      selection.images = true;
      reasons.add(sharedWeb ? "Web全体・生成入力の変更" : "Web製品コードの変更");
      continue;
    }

    return fullSelection("import以外の依存または未分類の変更");
  }
  if (reasons.size) selection.reason = [...reasons].sort().join("、");
  return selection;
}
