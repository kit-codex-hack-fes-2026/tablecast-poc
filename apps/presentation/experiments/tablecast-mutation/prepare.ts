import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { recordedTable } from "../../scripts/tablecast-capture-types.ts";
const root = resolve(import.meta.dirname, "../../../..");
const origin = "http://mutation.tablecast-poc.container.localhost:3100";
const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(
    JSON.parse(
      execFileSync(
        "docker",
        ["exec", "tablecast-mutation-tablecast-1", "cat", "/workspaces/tablecast/.local/demo.json"],
        { encoding: "utf8", windowsHide: true },
      ),
    ),
  );
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--host-resolver-rules=MAP mutation.tablecast-poc.container.localhost 127.0.0.1"],
});
try {
  const staff = await browser.newPage();
  await staff.goto(origin + "/api/health");
  const signedIn = await staff.evaluate(
    async ({ email, password }) => {
      const r = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return r.status;
    },
    { email: credentials.email, password: credentials.password },
  );
  if (signedIn !== 200) throw Error("ログイン失敗: " + signedIn);
  await staff
    .context()
    .storageState({ path: resolve(root, ".local/tablecast-mutation-staff-auth.json") });
  const req = async (path: string, body?: unknown): Promise<unknown> =>
    staff.evaluate(
      async ({ path: endpoint, body: payload }) => {
        const base = "/api/admin/stores/tablecast-komorebi";
        const r = await fetch(base + endpoint, {
          method: payload === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
          body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        if (!r.ok) throw Error(endpoint + " " + r.status);
        const value: unknown = await r.json();
        return value;
      },
      { path, body },
    );
  const d = z
    .object({ tables: z.array(recordedTable.extend({ voiceState: z.string() })) })
    .parse(await req(""));
  const t =
    d.tables.find(
      (entry) =>
        entry.tableName === "T01" &&
        !entry.cart.lines.length &&
        !entry.orders.length &&
        entry.voiceState === "stopped",
    ) ??
    d.tables.find(
      (entry) => !entry.cart.lines.length && !entry.orders.length && entry.voiceState === "stopped",
    );
  if (!t) throw Error("空の合成卓がありません");
  await req("/tables/" + t.id + "/close", {});
  const fresh = recordedTable.parse(
    await req("/tables/open", { tableId: t.tableId, guestCount: 2, locale: "ja" }),
  );
  const table = { id: fresh.tableId, session: fresh.id, name: fresh.tableName };
  const guest = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await guest.goto(origin + "/api/health");
  const pair = z.object({ user_code: z.string(), device_code: z.string() }).parse(
    await guest.evaluate(async () => {
      const r = await fetch("/api/devices/request", { method: "POST" });
      if (!r.ok) throw Error("request " + r.status);
      const value: unknown = await r.json();
      return value;
    }),
  );
  await staff.evaluate(
    async ({ pairing, destination }) => {
      const r = await fetch("/api/admin/stores/tablecast-komorebi/devices/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: pairing.user_code, tableId: destination.id }),
      });
      if (!r.ok) throw Error("approve " + r.status);
    },
    { pairing: pair, destination: table },
  );
  const poll = await guest.evaluate(async (pairing) => {
    const r = await fetch("/api/devices/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: pairing.device_code }),
    });
    if (!r.ok) throw Error("poll " + r.status);
    const value: unknown = await r.json();
    return value;
  }, pair);
  z.object({ ready: z.literal(true) }).parse(poll);
  await guest
    .context()
    .storageState({ path: resolve(root, ".local/tablecast-mutation-guest-auth.json") });
  await guest.goto(origin);
  await guest.getByRole("tab", { name: "商品を選ぶ", exact: true }).click();
  const originalLocatorCount = await guest
    .getByRole("tab", { name: "おしながき", exact: true })
    .count();
  if (originalLocatorCount !== 0) throw Error("元の撮影用ラベルが残っています");
  const out = resolve(
    root,
    "apps/presentation/assets/openscreen/tablecast-mutation-preflight-" + Date.now(),
  );
  await mkdir(out, { recursive: false });
  await guest.screenshot({ path: resolve(out, "guest.png") });
  await writeFile(resolve(out, "guest.txt"), await guest.locator("body").innerText());
  await writeFile(
    resolve(root, "apps/presentation/experiments/tablecast-mutation/session.json"),
    JSON.stringify(
      {
        origin,
        table,
        oldAdapterProbe: {
          selector: "tab:おしながき",
          count: originalLocatorCount,
          result: "expected-incompatible",
        },
        updatedAdapterProbe: { selector: "tab:商品を選ぶ", result: "passed" },
      },
      null,
      2,
    ),
  );
  console.log(
    "隔離DBに新しい合成来店を準備:",
    table.name,
    "旧ラベルでは収録開始不可、新ラベルで実操作成功",
  );
} finally {
  await browser.close();
}
