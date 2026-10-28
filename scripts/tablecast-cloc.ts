import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { parseArgs, promisify } from "node:util";

export const clocCommentMarker = "<!-- tablecast-cloc -->";
export const clocCategories = [
  { id: "documentation", label: "文書・skills・Agent指示" },
  { id: "implementation", label: "実装コード" },
  { id: "unit", label: "単体・統合テスト" },
  { id: "browser", label: "Browserコンポーネントテスト" },
  { id: "storybook", label: "Storybook" },
  { id: "e2e", label: "E2Eテスト" },
  { id: "support", label: "テスト補助" },
  { id: "configuration", label: "設定・CI" },
  { id: "migration", label: "DB migration" },
  { id: "other", label: "データ・その他" },
] as const;

type Category = (typeof clocCategories)[number]["id"];
type Counts = Partial<Record<Category, number>>;
type Measurement = {
  after: Counts;
  base: string;
  before: Counts;
  head: string;
  measuredAt: string;
};

const exec = promisify(execFile);
const shaPattern = /^[a-f0-9]{40}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyClocFile(
  path: string,
  externalSkills: ReadonlySet<string>,
): Category | null {
  const name = path.split("/").at(-1) ?? path;
  if (
    path.startsWith("apps/presentation/") ||
    /(?:^|\/)(?:node_modules|dist|out|coverage|storybook-static|paraglide|test-results|playwright-report|\.local|\.turbo|\.wrangler|\.cloudflare)\//.test(
      path,
    ) ||
    /(?:^|\/)migrations\/meta\//.test(path) ||
    /(?:\.gen\.|\.generated\.|^generated-)/.test(name) ||
    /^(?:cloudflare-env|worker-configuration)\.d\.ts$/.test(name) ||
    /^(?:bun\.lockb?|.*\.lock|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|skills-lock\.json)$/.test(
      name,
    ) ||
    /\.(?:avif|gif|ico|jpe?g|png|svg|webp|mp[34]|wav|ogg|webm|mov|pdf|woff2?|ttf|zip|gz|snap)$/.test(
      name,
    ) ||
    [...externalSkills].some((skill) => path.startsWith(`.agents/skills/${skill}/`))
  )
    return null;

  if (
    /\.stories\.[^.]+$/.test(name) ||
    path.includes("/.storybook/") ||
    (name.endsWith(".mdx") && path.startsWith("apps/web/"))
  )
    return "storybook";
  if (path.startsWith(".agents/skills/") || /\.(?:md|mdx|txt)$/.test(name)) return "documentation";
  if (/\.browser\.(?:test|spec)\.[^.]+$/.test(name)) return "browser";
  if (/\.(?:test|spec)\.[^.]+$/.test(name))
    return path.startsWith("apps/web/e2e/") ? "e2e" : "unit";
  if (
    /(?:^|\/)(?:test|tests|test-support|testing|fixtures|__fixtures__)\//.test(path) ||
    path.startsWith("apps/web/e2e/") ||
    (/(?:^|[.-])fixtures?(?:[.-]|$)/.test(name) && !path.startsWith("scripts/tablecast-fixtures"))
  )
    return "support";
  if (/^apps\/api\/migrations\/.*\.sql$/.test(path)) return "migration";
  if (
    /^(?:\.github|\.devcontainer|infra)\//.test(path) ||
    /(?:^|\/)\.[^/]+(?:ignore|config)$/.test(path) ||
    /(?:^|\/)(?:[^/]+\.)?config\.[^/]+$/.test(path) ||
    /^(?:\..*ignore|\.fallowrc\.json|\.lfsconfig|\.worktreeinclude|\.env.*|package\.json|tsconfig(?:\..*)?\.json|turbo\.jsonc?|compose\.ya?ml|lefthook\.ya?ml|mise\.toml|Dockerfile|components\.json)$/.test(
      name,
    ) ||
    /(?:^|\/)project\.inlang\//.test(path) ||
    path.startsWith(".agents/plugins/") ||
    /^plugins\/[^/]+\/(?:\.codex-plugin|\.mcp\.json)/.test(path)
  )
    return "configuration";
  if (/\.(?:[cm]?[jt]sx?|css|html|sh|py|sql)$/.test(name)) return "implementation";
  return "other";
}

export function aggregateCloc(data: unknown, externalSkills: ReadonlySet<string>): Counts {
  if (!record(data) || !record(data.header) || data.header.cloc_version !== "2.10")
    throw new Error("cloc 2.10のJSONではありません。");
  const counts: Counts = {};
  for (const [path, file] of Object.entries(data)) {
    if (path === "header" || path === "SUM") continue;
    if (
      !record(file) ||
      typeof file.code !== "number" ||
      !Number.isSafeInteger(file.code) ||
      file.code < 0
    )
      throw new Error("clocのファイル別行数が不正です。");
    const category = classifyClocFile(path.replace(/^\.\//, ""), externalSkills);
    if (category) counts[category] = (counts[category] ?? 0) + file.code;
  }
  return counts;
}

export async function measureCloc(
  base: string,
  head: string,
  cwd = process.cwd(),
): Promise<Measurement> {
  if (!shaPattern.test(base) || !shaPattern.test(head))
    throw new Error("baseとheadには40桁のcommit SHAが必要です。");
  const run = async (command: string, args: string[]) =>
    (await exec(command, args, { cwd, maxBuffer: 32 * 1024 * 1024 })).stdout;
  const mergeBase = (await run("git", ["merge-base", base, head])).trim();
  if (!shaPattern.test(mergeBase)) throw new Error("merge-baseを取得できません。");
  const locks = await Promise.all(
    [mergeBase, head].map(async (sha) => {
      if (!(await run("git", ["ls-tree", "--name-only", sha, "--", "skills-lock.json"])).trim())
        return [];
      const lock: unknown = JSON.parse(await run("git", ["show", `${sha}:skills-lock.json`]));
      if (!record(lock) || !record(lock.skills)) throw new Error("skills-lock.jsonが不正です。");
      return Object.keys(lock.skills);
    }),
  );
  const externalSkills = new Set(locks.flat());
  const count = async (sha: string) => {
    const output = await run(process.env.TABLECAST_CLOC_PATH || "cloc", [
      "--git",
      sha,
      "--by-file",
      "--json",
      "--skip-uniqueness",
      "--quiet",
      "--timeout=0",
    ]);
    const data: unknown = JSON.parse(output);
    return aggregateCloc(data, externalSkills);
  };
  const [before, after] = await Promise.all([count(mergeBase), count(head)]);
  return { base: mergeBase, head, before, after, measuredAt: new Date().toISOString() };
}

export function renderClocComment(measurement: Measurement, repository?: string, runUrl?: string) {
  if (repository && !/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error("repositoryが不正です。");
  const commit = (sha: string) => {
    if (!shaPattern.test(sha)) throw new Error("計測対象SHAが不正です。");
    const label = `\`${sha.slice(0, 7)}\``;
    return repository ? `[${label}](https://github.com/${repository}/commit/${sha})` : label;
  };
  const format = (value: number) => value.toLocaleString("en-GB");
  const difference = (before: number, after: number) =>
    `${after > before ? "+" : ""}${format(after - before)}`;
  const measuredAt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(measurement.measuredAt));
  let beforeTotal = 0;
  let afterTotal = 0;
  const rows = clocCategories.map(({ id, label }) => {
    const before = measurement.before[id] ?? 0;
    const after = measurement.after[id] ?? 0;
    beforeTotal += before;
    afterTotal += after;
    return `| ${label} | ${format(before)} | ${format(after)} | ${difference(before, after)} |`;
  });
  return [
    clocCommentMarker,
    `📏 **行数レポート** · ${commit(measurement.base)} → ${commit(measurement.head)}`,
    "",
    `計測完了日時 (JST): ${measuredAt}${runUrl ? ` · [CI ↗](${runUrl})` : ""}`,
    "",
    "| 分類 | 比較元 | PR | 純増減 |",
    "| --- | ---: | ---: | ---: |",
    ...rows,
    `| **合計** | **${format(beforeTotal)}** | **${format(afterTotal)}** | **${difference(beforeTotal, afterTotal)}** |`,
    "",
    "cloc 2.10のcode行数（空行・コードのコメント行を除外）。文書はclocが数えた本文行数。比較元はPRのmerge-base。",
    "動画基盤・生成物・lockfile・画像や音声・両版のskills-lockに記載された取得skillを除外。同一内容の別ファイルは各々計上。",
  ].join("\n");
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      base: { type: "string" },
      head: { type: "string" },
      output: { type: "string" },
    },
  });
  const measurement = await measureCloc(values.base ?? "", values.head ?? "");
  const repository = process.env.GITHUB_REPOSITORY;
  const runUrl =
    repository && process.env.GITHUB_RUN_ID
      ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined;
  const body = `${renderClocComment(measurement, repository, runUrl)}\n`;
  if (values.output) await writeFile(values.output, body);
  else process.stdout.write(body);
}
