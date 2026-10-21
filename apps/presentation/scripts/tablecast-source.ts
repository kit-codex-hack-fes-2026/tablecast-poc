import { realpath, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";

export const repositoryRoot = resolve(import.meta.dirname, "../../..");
export function repositoryPath(file: string, base = repositoryRoot) {
  const path = relative(base, file);
  if (!path || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`))
    throw new Error("共有する入力はリポジトリ内に置いてください");
  return path.split(sep).join("/");
}
export const sourcePathSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)
  .refine(
    (path) => path.split("/").every((part) => part !== "." && part !== ".."),
    "参照元はリポジトリ内の相対パスを指定してください",
  );

// 字面だけでなくリンク先も確認し、フォルダー内の参照も境界の外へ出さない。
export async function resolveSource(path: string, base = repositoryRoot): Promise<string> {
  sourcePathSchema.parse(path);
  const root = await realpath(base);
  const resolved = resolve(root, path);
  const visited = new Set<string>();
  const check = async (candidate: string): Promise<void> => {
    const actual = await realpath(candidate);
    const child = relative(root, actual);
    if (!child || isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`))
      throw new Error(`参照元がリポジトリの外です: ${path}`);
    if ((await stat(actual)).isDirectory()) {
      if (visited.has(actual)) throw new Error(`参照元に循環したリンクがあります: ${path}`);
      visited.add(actual);
      for (const name of await readdir(actual)) await check(resolve(actual, name));
      visited.delete(actual);
    }
  };
  await check(resolved);
  return resolved;
}
