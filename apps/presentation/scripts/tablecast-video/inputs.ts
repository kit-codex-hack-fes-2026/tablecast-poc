import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
export const sha = async (file: string): Promise<string> => {
  const content = (await stat(file)).isDirectory()
    ? JSON.stringify(
        await Promise.all(
          (await readdir(file)).sort().map(async (name) => [name, await sha(resolve(file, name))]),
        ),
      )
    : await readFile(file);
  return createHash("sha256").update(content).digest("hex");
};
