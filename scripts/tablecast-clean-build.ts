import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { readBuildOutput } from "@cloudflare/build-output-utils";

// Viteのpreview用秘密値は、Turboが成果物をcacheする前に除外する。
const root = process.cwd();
const output = await readBuildOutput(root);
if (["preview", "staging", "production"].includes(output.rootConfig.buildContext.mode ?? "")) {
  const directory = resolve(root, ".cloudflare/output");
  for (const path of await readdir(directory, { recursive: true })) {
    const name = path.split("/").at(-1);
    if (name?.startsWith(".dev.vars") || name?.startsWith(".env"))
      await rm(resolve(directory, path), { force: true });
  }
}
