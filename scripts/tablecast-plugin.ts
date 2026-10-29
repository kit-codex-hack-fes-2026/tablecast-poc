import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { assertPrepared, tablecastLocal, tablecastRoot } from "./tablecast-runtime.ts";

const syncOnly = process.argv.includes("--skills-only");
for (const skill of ["tablecast", "tablecast-theme", "tablecast-help"]) {
  await cp(
    join(tablecastRoot, ".agents/skills", skill),
    join(tablecastRoot, "plugins/tablecast/skills", skill),
    { recursive: true },
  );
}
const published = syncOnly ? undefined : process.argv[2];
if (syncOnly) process.exit(0);
if (!published) await assertPrepared();
const origin = new URL(
  published ??
    parseEnv(await readFile(join(tablecastLocal, ".env"), "utf8")).TABLECAST_PUBLIC_ORIGIN ??
    "",
).origin;
if (
  published &&
  (new URL(origin).protocol !== "https:" || /(?:localhost|\.local)$/.test(new URL(origin).hostname))
)
  throw new Error("公開パッケージには実際のHTTPS originを指定してください。");
const destination = published
  ? tablecastRoot
  : join(tablecastLocal, "tablecast-plugin-marketplace");
if (!published) {
  await mkdir(join(destination, ".agents/plugins"), { recursive: true });
  await cp(join(tablecastRoot, "plugins"), join(destination, "plugins"), { recursive: true });
  const marketplace = await readFile(
    join(tablecastRoot, ".agents/plugins/marketplace.json"),
    "utf8",
  );
  await writeFile(join(destination, ".agents/plugins/marketplace.json"), marketplace);
}
await writeFile(
  join(destination, "plugins/tablecast/.mcp.json"),
  JSON.stringify({ mcpServers: { tablecast: { url: `${origin}/mcp` } } }, null, 2) + "\n",
);
console.info(`TableCast plugin: ${destination}`);
