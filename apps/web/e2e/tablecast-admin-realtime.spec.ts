import { expect, type WebSocketRoute } from "@playwright/test";
import { adminStateSchema, eventsSchema, tableStateSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ actionTimeout: 15_000, serviceWorkers: "block" });

test("管理画面が実通知の切断中と再接続後の会計イベントを欠落・重複なく表示する", async ({
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
  await signInStaff(page.request, baseURL);
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
  await page.getByRole("combobox", { name: /言語|language/i }).click();
  await page.getByRole("option", { name: "日本語", exact: true }).click();
  await expect.poll(() => connected).toBeGreaterThan(0);
  const table = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }) });
  await expect(table).toHaveCount(1);
  await table.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }).click();
  const detail = page.getByRole("main");
  await detail.getByRole("tab", { name: ja.admin_logs, exact: true }).click();
  await record("adjustment", 100);
  await expect(detail.getByText(ja.event_bill_adjusted, { exact: true })).toHaveCount(1);

  // 実サーバーとの通知だけを切り、管理画面のHTTP event取得による回復を確認する。
  dropped = true;
  await Promise.all(sockets.map((socket) => socket.close({ code: 1001 })));
  // 書込み前に待ち始め、最初のHTTP復旧応答を取り逃さない。
  const [synchronised, payment] = await Promise.all([
    page.waitForResponse(
      async (response) => {
        if (new URL(response.url()).pathname !== `${base}/events` || !response.ok()) return false;
        return eventsSchema
          .parse(await response.json())
          .events.some(
            (event) => event.kind === "billing.payment" && event.tableSessionId === sessionId,
          );
      },
      { timeout: 15_000 },
    ),
    record("payment", 100),
  ]);
  expect(eventsSchema.parse(await synchronised.json()).cursor).toBeGreaterThanOrEqual(
    payment.cursor,
  );
  await expect(detail.getByText(ja.event_payment_recorded, { exact: true })).toHaveCount(1);

  const before = connected;
  dropped = false;
  await expect.poll(() => connected).toBeGreaterThan(before);
  const beforeNotification = notifications;
  await record("adjustment", 200);
  await expect.poll(() => notifications).toBeGreaterThan(beforeNotification);
  await expect(detail.getByText(ja.event_bill_adjusted, { exact: true })).toHaveCount(2);
  await expect(detail.getByText(ja.event_payment_recorded, { exact: true })).toHaveCount(1);
  await page.goto(`/admin/stores/${storeId}/floor`);
  await expect(table).toContainText(/[¥￥]200/);
  await expect(table).toHaveCount(1);
});
