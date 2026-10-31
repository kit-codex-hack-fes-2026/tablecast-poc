import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";
import { tablecastAccountId } from "../tablecast-deploy-config.ts";
import { directory, root, target } from "./runtime.ts";

async function run(args: [string, ...string[]], env: Record<string, string> = {}, cwd = root) {
  const code = await new Promise<null | number>((complete, reject) => {
    const child = spawn(args[0], args.slice(1), {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", complete);
  });
  if (code !== 0) throw new Error(`配備コマンドが失敗しました: ${args.slice(0, 4).join(" ")}`);
}

export const cf = (args: string[], cwd = root) =>
  run(
    ["node", resolve(root, "node_modules/cf/bin/cf"), ...args],
    { CLOUDFLARE_ACCOUNT_ID: tablecastAccountId },
    cwd,
  );

export async function deployTemporaryWorker(worker: object, kind: string) {
  const temporary = resolve(directory, kind);
  await mkdir(temporary, { recursive: true });
  const apiManifest = z
    .object({ devDependencies: z.record(z.string(), z.string()) })
    .parse(JSON.parse(await readFile(resolve(root, "apps/api/package.json"), "utf8")));
  await writeFile(
    resolve(temporary, "package.json"),
    JSON.stringify({
      type: "module",
      devDependencies: {
        "@cloudflare/vite-plugin": apiManifest.devDependencies["@cloudflare/vite-plugin"],
        vite: apiManifest.devDependencies.vite,
      },
    }),
  );
  const modules = resolve(root, "apps/api/node_modules");
  const link = resolve(temporary, "node_modules");
  try {
    await symlink(modules, link, "dir");
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "EEXIST") ||
      (await readlink(link)) !== modules
    )
      throw error;
  }
  await copyFile(resolve(root, "apps/api/vite.config.ts"), resolve(temporary, "vite.config.ts"));
  await writeFile(
    resolve(temporary, "cloudflare.config.ts"),
    `export default ${JSON.stringify({ accountId: tablecastAccountId, worker })};`,
  );
  await cf(["build", "--mode", target.environment], temporary);
  await cf(["deploy", "--prebuilt", "--mode", target.environment], temporary);
}
