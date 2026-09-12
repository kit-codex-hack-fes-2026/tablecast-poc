import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRuntime, tablecastLocal, tablecastRoot } from "./tablecast-runtime";

const published = process.argv[2];
const origin = published ? new URL(published).origin : (await readRuntime()).origin;
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
