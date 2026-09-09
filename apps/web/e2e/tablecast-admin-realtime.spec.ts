import { test } from "./support/test";
import { expect, type WebSocketRoute } from "@playwright/test";
import { adminStateSchema, eventsSchema, tableStateSchema } from "@tablecast/api/schema";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

test.use({ actionTimeout: 15_000 });

for (const { language, labels } of [
  { language: "日本語", labels: ja },
  { language: "English", labels: en },
]) {
  test(`${language === "English" ? "英語" : language}の管理画面が通知切断中と再接続後の会計イベントを欠落・重複なく表示する`, async ({
    page,
    baseURL,
  }) => {
    const storeId = "tablecast-komorebi";
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
      const vacant = initial.vacantTables[0];
      if (!vacant) throw new Error("試験用の空卓が必要です。既存の利用卓は変更しません。");
      const tableId = vacant.id;
      const opened = await page.request.post(`${base}/tables/open`, {
        headers,
        data: { tableId, guestCount: 2, locale: "ja" },
      });
      expect(opened.status()).toBe(200);
      sessionId = tableStateSchema.parse(await opened.json()).id;
      await page.goto(`/admin/stores/${storeId}/floor`);
      await page.getByRole("button", { name: language, exact: true }).click();
      await expect.poll(() => connected).toBeGreaterThan(0);
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }) });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }).click();
      const detail = page.getByRole("main");
      await detail.getByRole("tab", { name: labels.admin_logs, exact: true }).click();
      await record("adjustment", 100);
      await expect(detail.getByText(labels.event_bill_adjusted, { exact: true })).toHaveCount(1);

      // 実サーバーとの通知だけを切り、管理画面のHTTP event取得による回復を確認する。
      dropped = true;
      await Promise.all(sockets.map((socket) => socket.close({ code: 1001 })));
      const payment = await record("payment", 100);
      // スナップショットが先行した場合も、HTTP同期のカーソルが入金まで進むことを確認する。
      await page.waitForResponse(
        async (response) => {
          if (new URL(response.url()).pathname !== `${base}/events` || !response.ok()) return false;
          return eventsSchema.parse(await response.json()).cursor >= payment.cursor;
        },
        { timeout: 15_000 },
      );
      await expect(detail.getByText(labels.event_payment_recorded, { exact: true })).toHaveCount(1);

      const before = connected;
      dropped = false;
      await expect.poll(() => connected).toBeGreaterThan(before);
      const beforeNotification = notifications;
      await record("adjustment", 200);
      await expect.poll(() => notifications).toBeGreaterThan(beforeNotification);
      await expect(detail.getByText(labels.event_bill_adjusted, { exact: true })).toHaveCount(2);
      await expect(detail.getByText(labels.event_payment_recorded, { exact: true })).toHaveCount(1);
      await page.goto(`/admin/stores/${storeId}/floor`);
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
