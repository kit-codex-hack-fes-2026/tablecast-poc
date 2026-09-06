import { readFileSync } from "node:fs";
import { z } from "zod";
import { adminStateSchema, tableStateSchema } from "@tablecast/api/schema";
import { expect, test, type WebSocketRoute } from "@playwright/test";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { eventsSchema } from "../src/lib/responses";

const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../../../.local/demo.json", import.meta.url), "utf8")));

test.use({ trace: "off" });

for (const { language, labels } of [
  { language: "日本語", labels: ja },
  { language: "English", labels: en },
]) {
  test(`${language === "English" ? "英語" : language}の管理画面が通知切断中と再接続後の会計イベントを欠落・重複なく表示する`, async ({
    page,
    baseURL,
  }) => {
    const storeId = "tablecast-komorebi";
    const tableId = `${storeId}-table-12`;
    const base = `/api/admin/stores/${storeId}`;
    const headers = { Origin: baseURL ?? "" };
    let sessionId = "";
    let dropped = false;
    let connected = 0;
    let notifications = 0;
    const sockets: WebSocketRoute[] = [];
    await page.routeWebSocket(/\/api\/admin\/stores\/tablecast-komorebi\/live$/, async (socket) => {
      if (dropped) {
        await socket.close({ code: 1001 });
        return;
      }
      const server = socket.connectToServer();
      server.onMessage((message) => {
        if (message === "pong") connected++;
        else {
          notifications++;
          socket.send(message);
        }
      });
      server.send("ping");
      sockets.push(socket);
    });
    async function record(kind: "adjustment" | "payment", amount: number) {
      const response = await page.request.post(`${base}/tables/${sessionId}/payments`, {
        headers,
        data: { kind, amount, reason: "通知復旧の合成試験", idempotencyKey: crypto.randomUUID() },
      });
      expect(response.status()).toBe(200);
      return tableStateSchema.parse(await response.json());
    }
    const login = await page.request.post("/api/auth/sign-in/email", {
      headers,
      data: credentials,
    });
    expect(login.status()).toBe(200);
    try {
      const initial = adminStateSchema.parse(await (await page.request.get(base)).json());
      expect(initial.vacantTables.some((table) => table.id === tableId)).toBe(true);
      const opened = await page.request.post(`${base}/tables/open`, {
        headers,
        data: { tableId, guestCount: 2, locale: "ja" },
      });
      expect(opened.status()).toBe(200);
      sessionId = tableStateSchema.parse(await opened.json()).id;
      await page.goto("/admin/live");
      await page.getByRole("button", { name: language, exact: true }).click();
      await page.getByRole("combobox", { name: labels.admin_store }).selectOption(storeId);
      await expect.poll(() => connected).toBeGreaterThan(0);
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "T12", exact: true }) });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: /^T12/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: labels.admin_logs, exact: true }).click();
      await record("adjustment", 100);
      await expect(dialog.getByText(labels.event_bill_adjusted, { exact: true })).toHaveCount(1);

      // 実サーバーとの通知だけを切り、管理画面のHTTP event取得による回復を確認する。
      dropped = true;
      await Promise.all(sockets.map((socket) => socket.close({ code: 1001 })));
      const recovered = page.waitForResponse(async (response) => {
        if (new URL(response.url()).pathname !== `${base}/events` || !response.ok()) return false;
        const { events } = eventsSchema.parse(await response.json());
        return events.some(
          (event) => event.tableSessionId === sessionId && event.kind === "billing.payment",
        );
      });
      await Promise.all([record("payment", 100), recovered]);
      await expect(dialog.getByText(labels.event_payment_recorded, { exact: true })).toHaveCount(1);

      const before = connected;
      dropped = false;
      await expect.poll(() => connected).toBeGreaterThan(before);
      const beforeNotification = notifications;
      await record("adjustment", 200);
      await expect.poll(() => notifications).toBeGreaterThan(beforeNotification);
      await expect(dialog.getByText(labels.event_bill_adjusted, { exact: true })).toHaveCount(2);
      await expect(dialog.getByText(labels.event_payment_recorded, { exact: true })).toHaveCount(1);
      await dialog.getByRole("button", { name: labels.common_close, exact: true }).click();
      await expect(row).toContainText(/[¥￥]200/);
      await expect(row).toHaveCount(1);
    } finally {
      try {
        if (sessionId) {
          const current = await page.request.get(`${base}/tables/${sessionId}`);
          expect(current.status()).toBe(200);
          const table = tableStateSchema.parse(await current.json());
          if (table.bill.due > 0) await record("payment", table.bill.due);
          const closed = await page.request.post(`${base}/tables/${sessionId}/close`, {
            headers,
            data: {},
          });
          expect(closed.status()).toBe(200);
        }
      } finally {
        const logout = await page.request.post("/api/auth/sign-out", { headers, data: {} });
        expect(logout.status()).toBe(200);
      }
    }
  });
}
