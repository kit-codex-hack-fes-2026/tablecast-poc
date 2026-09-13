import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { configDraftSchema } from "../../../api/src/modules/configuration/model.ts";
const root = resolve(import.meta.dirname, "../../../..");
const voices = z
  .object({ ja: z.string(), en: z.string() })
  .parse(
    JSON.parse(
      execFileSync(
        "docker",
        [
          "exec",
          "-w",
          "/workspaces/tablecast",
          "tablecast-mutation-tablecast-1",
          "bun",
          "--env-file=.env.secrets.local",
          "-e",
          "console.log(JSON.stringify({ja:process.env.TABLECAST_INWORLD_VOICE_JA,en:process.env.TABLECAST_INWORLD_VOICE_EN}))",
        ],
        { encoding: "utf8", windowsHide: true },
      ),
    ),
  );
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--host-resolver-rules=MAP mutation.tablecast-poc.container.localhost 127.0.0.1"],
});
try {
  const page = await browser.newPage({
    storageState: resolve(root, ".local/tablecast-mutation-staff-auth.json"),
  });
  await page.goto("http://mutation.tablecast-poc.container.localhost:3100/api/health");
  const req = async (path: string, method: string, body?: unknown): Promise<unknown> =>
    page.evaluate(
      async ({ path: endpoint, method: httpMethod, body: payload }) => {
        const base = "/api/admin/stores/tablecast-komorebi";
        const r = await fetch(base + endpoint, {
          method: httpMethod,
          headers: { "Content-Type": "application/json" },
          body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        const value: unknown = await r.json();
        if (!r.ok) throw Error(`${endpoint}: ${r.status}`);
        return value;
      },
      { path, method, body },
    );
  let draft = configDraftSchema.parse(await req("/drafts", "POST"));
  draft.configuration.cast.voice = voices;
  draft = configDraftSchema.parse(
    await req("/drafts/" + draft.id, "PUT", {
      expectedVersion: draft.version,
      configuration: draft.configuration,
    }),
  );
  draft = configDraftSchema.parse(
    await req("/drafts/" + draft.id + "/validate", "POST", {
      expectedVersion: draft.version,
    }),
  );
  if (draft.errors.length) throw Error("設定検証失敗: " + JSON.stringify(draft.errors));
  await req("/drafts/" + draft.id + "/publish", "POST", {
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: crypto.randomUUID(),
    approved: true,
  });
  console.log("隔離店舗の音声設定を正規のdraft・検証・適用APIで登録しました");
} finally {
  await browser.close();
}
