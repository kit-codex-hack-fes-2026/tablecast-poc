export const previewCommentMarker = "<!-- tablecast-catalog-preview -->";
const catalogKinds = ["storybook", "email"] as const;
type CatalogKind = (typeof catalogKinds)[number];
type CatalogSelection = CatalogKind | "all";

function requestLine(kind: CatalogKind, checked: boolean) {
  return `- [${checked ? "x" : " "}] 🚀 **実行** <!-- tablecast-catalog-request:${kind} -->`;
}

function checkedKind(line: string) {
  return catalogKinds.find(
    (kind) =>
      line.startsWith("- [x] ") && line.endsWith(` <!-- tablecast-catalog-request:${kind} -->`),
  );
}

export function pendingCatalogRequests(body: string): CatalogKind[] {
  const lines = body.split("\n");
  return catalogKinds.filter((kind) => lines.some((line) => checkedKind(line) === kind));
}

export function resetCatalogRequest(body: string, catalog: CatalogSelection) {
  return body
    .split("\n")
    .map((line) => {
      const kind = checkedKind(line);
      return kind && (catalog === "all" || catalog === kind)
        ? line.replace("- [x] ", "- [ ] ")
        : line;
    })
    .join("\n");
}

export function parseCatalogRequest(input: {
  action: string;
  body: string;
  before?: string;
  authorLogin: string;
}): { catalog: CatalogSelection; sha?: string } | null {
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
  product: { url: string; result: string; served: string; deployedAt?: string };
  catalogs: {
    kind: CatalogKind;
    url: string;
    served: string;
    result?: string;
    deployedAt?: string;
  }[];
  runUrl: string;
  requested?: CatalogKind[];
}) {
  if (!Number.isSafeInteger(input.pr) || input.pr < 1 || !/^[a-f0-9]{40}$/.test(input.sha))
    throw new Error("プレビュー通知のPR・SHAが不正です。");
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const repositoryUrl = input.runUrl.split("/actions/runs/")[0] ?? "";
  const version = (served: string) =>
    /^[a-f0-9]{40}$/.test(served)
      ? `${served === input.sha ? "🟢" : "🟡"} <a href="${escape(`${repositoryUrl}/commit/${served}`)}"><code>${served.slice(0, 7)}</code></a>`
      : "—";
  const deployedAt = (value?: string) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "—";
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  };
  const result = (value: string) =>
    ({ success: "✅ 完了", failure: "❌ 失敗", cancelled: "⚪ 中止", skipped: "⏭️ 省略" })[value] ??
    "🔎 確認";
  const rows = [
    `<tr><td>🍽️ <a href="${escape(input.product.url)}">TableCast</a><br><sub>${version(input.product.served)}</sub></td><td>${result(input.product.result)}</td><td>${deployedAt(input.product.deployedAt)}</td></tr>`,
    ...input.catalogs.map((catalog) => {
      const name = catalog.kind === "storybook" ? "📚 Storybook" : "✉️ React Email";
      const outcome = catalog.result ? `\n\n${result(catalog.result)}` : "";
      return `<tr><td><a href="${escape(catalog.url)}">${name}</a><br><sub>${version(catalog.served)}</sub></td><td>\n\n${requestLine(catalog.kind, input.requested?.includes(catalog.kind) ?? false)}${outcome}\n\n</td><td>${deployedAt(catalog.deployedAt)}</td></tr>`;
    }),
  ];
  return [
    previewCommentMarker,
    "<!--",
    `対象SHA: ${input.sha}`,
    "-->",
    `🔒 **PR #${input.pr}** · [\`${input.sha.slice(0, 7)}\`](${repositoryUrl}/commit/${input.sha}) · [CI ↗](${input.runUrl})`,
    "",
    "<table>",
    "<tr><th>プレビュー</th><th>ビルド・デプロイ</th><th>デプロイ日時 (JST)</th></tr>",
    ...rows,
    "</table>",
  ].join("\n");
}
