export const previewCommentMarker = "<!-- tablecast-catalog-preview -->";
const catalogKinds = ["storybook", "email"] as const;
type CatalogKind = (typeof catalogKinds)[number];
type CatalogSelection = CatalogKind | "all";

function requestLine(kind: CatalogKind, checked: boolean) {
  const name = kind === "storybook" ? "Storybook" : "メール";
  return `- [${checked ? "x" : " "}] ${name}を生成・配備する <!-- tablecast-catalog-request:${kind} -->`;
}

export function pendingCatalogRequests(body: string): CatalogKind[] {
  const lines = body.split("\n");
  return catalogKinds.filter((kind) => lines.includes(requestLine(kind, true)));
}

export function resetCatalogRequest(body: string, catalog: CatalogSelection) {
  return body
    .split("\n")
    .map((line) => {
      const kind = catalogKinds.find((value) => line === requestLine(value, true));
      return kind && (catalog === "all" || catalog === kind) ? requestLine(kind, false) : line;
    })
    .join("\n");
}

export function parseCatalogRequest(input: {
  action: string;
  body: string;
  before?: string;
  authorLogin: string;
}): { catalog: CatalogSelection; sha?: string } | null {
  if (input.action === "created") {
    if (input.authorLogin.endsWith("[bot]")) return null;
    const match = /^\/tablecast catalog(?: (storybook|email|all))?$/.exec(input.body.trim());
    const catalog = match?.[1] ?? (match ? "all" : undefined);
    return catalog === "storybook" || catalog === "email" || catalog === "all" ? { catalog } : null;
  }
  if (
    input.action !== "edited" ||
    input.authorLogin !== "github-actions[bot]" ||
    !input.body.startsWith(`${previewCommentMarker}\n`) ||
    !input.before?.startsWith(`${previewCommentMarker}\n`)
  )
    return null;
  const sha = [...input.body.matchAll(/^対象SHA: ([a-f0-9]{40})$/gm)];
  const beforeSha = [...input.before.matchAll(/^対象SHA: ([a-f0-9]{40})$/gm)];
  if (sha.length !== 1 || beforeSha.length !== 1 || sha[0]?.[1] !== beforeSha[0]?.[1]) return null;
  const previous = pendingCatalogRequests(input.before);
  const selected = pendingCatalogRequests(input.body).filter((kind) => !previous.includes(kind));
  const [first] = selected;
  if (!first) return null;
  return { catalog: selected.length === 2 ? "all" : first, sha: sha[0]?.[1] };
}

export function renderPreviewComment(input: {
  pr: number;
  sha: string;
  product: { url: string; result: string; served: string };
  catalogs: { kind: CatalogKind; url: string; served: string; result?: string }[];
  runUrl: string;
  requested?: CatalogKind[];
}) {
  if (!Number.isSafeInteger(input.pr) || input.pr < 1 || !/^[a-f0-9]{40}$/.test(input.sha))
    throw new Error("プレビュー通知のPR・SHAが不正です。");
  const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
  const rows = [
    `| 製品 | ${cell(input.product.url)} | ${cell(input.product.result)} | ${cell(input.product.served)} |`,
    ...input.catalogs.map(
      (catalog) =>
        `| ${catalog.kind} | ${cell(catalog.url)} | ${cell(catalog.result ?? "手動配備")} | ${cell(catalog.served)} |`,
    ),
  ];
  return [
    previewCommentMarker,
    "PRプレビュー（Cloudflare Accessへのログインが必要）",
    "",
    `対象SHA: ${input.sha}`,
    "",
    "| 対象 | URL | 配備結果 | 通知時に確認できた配備SHA |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "必要なカタログにチェックすると、対象SHAから生成・配備する。write権限が必要。",
    ...catalogKinds.map((kind) => requestLine(kind, input.requested?.includes(kind) ?? false)),
    "",
    "コメントの `/tablecast catalog storybook`、`/tablecast catalog email`、`/tablecast catalog all` でも実行できる。",
    "配備済みSHAが対象SHAと異なる場合、URLには前の版が表示される。",
    "手動カタログは表示の確認用。必須CIの結果はPRのチェックを参照。",
    "",
    `[実行結果](${input.runUrl})`,
  ].join("\n");
}
