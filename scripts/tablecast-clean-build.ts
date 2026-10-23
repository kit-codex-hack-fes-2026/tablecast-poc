import { readBuildOutput } from "@cloudflare/build-output-utils";
import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Viteのpreview用秘密値は、Turboのcacheと配備成果物の両方から除外する。
export async function cleanBuild(root: string, mode?: string) {
  if (!["preview", "staging", "production"].includes(mode ?? "")) return;
  const directory = resolve(root, ".cloudflare/output");
  for (const path of await readdir(directory, { recursive: true })) {
    const name = path.split("/").at(-1);
    if (name?.startsWith(".dev.vars") || name?.startsWith(".env"))
      await rm(resolve(directory, path), { force: true });
  }
}

if (import.meta.main) {
  const root = process.cwd();
  await cleanBuild(root, (await readBuildOutput(root)).rootConfig.buildContext.mode);
}
