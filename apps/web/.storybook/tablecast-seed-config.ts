import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

let prepared: undefined | { data: string; directory: string };

// seedのBun実行境界を保ち、NodeのVite設定へはJSONだけを渡す。
export function prepareTablecastSeedPreview() {
  if (!prepared)
    prepared = {
      data: execFileSync(
        "bun",
        [
          "--no-env-file",
          resolve(import.meta.dirname, "../../../scripts/tablecast-storybook-seed.ts"),
        ],
        {
          encoding: "utf8",
          maxBuffer: 8 * 1024 * 1024,
        },
      ).trim(),
      directory: resolve(import.meta.dirname, "../.local/tablecast-storybook-public"),
    };
  return prepared;
}
