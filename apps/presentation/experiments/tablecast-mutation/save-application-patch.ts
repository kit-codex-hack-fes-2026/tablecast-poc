import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const variant = resolve(import.meta.dirname, "../../../../../tablecast-mutation-test");
const patch = resolve(import.meta.dirname, "application.patch");
const options = { cwd: variant, windowsHide: true };
await writeFile(patch, execFileSync("git", ["diff", "--binary"], options));
execFileSync("git", ["apply", "--reverse", "--check", patch], options);
console.log("アプリ差分を改行変換せず保存し、現在の変更との一致を検査しました");
