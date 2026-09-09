import { readFileSync } from "node:fs";
import { z } from "zod";
import { adminStateSchema, catalogSchema, tableStateSchema } from "@tablecast/api/schema";
import { expect, test, type WebSocketRoute } from "@playwright/test";

const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../../../.local/demo.json", import.meta.url), "utf8")));

test("通知切断中の変更を回復し、古い確認と期限切れの確認を閉じて重複表示しない", async ({
  page,
  request: staff,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  const headers = { Origin: baseURL ?? "" };
  const login = await staff.post("/api/auth/sign-in/email", { data: credentials, headers });
  expect(login.status()).toBe(200);
  const stateResponse = await staff.get(`/api/admin/stores/${storeId}`);
  expect(stateResponse.status()).toBe(200);
  const vacant = adminStateSchema.parse(await stateResponse.json()).vacantTables[0];
  if (!vacant) throw new Error("試験用の空卓が必要です。既存の利用卓は変更しません。");
  const tableId = vacant.id;
  let sessionId = "";
  let dropped = false;
  let connected = 0;
  let notifications = 0;
  const sockets: WebSocketRoute[] = [];
  await page.clock.install();
  await page.routeWebSocket(/\/api\/table\/live$/, async (socket) => {
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
  try {
    const opened = await staff.post(`/api/admin/stores/${storeId}/tables/open`, {
      headers,
      data: { tableId, guestCount: 2, locale: "ja" },
    });
    expect(opened.status()).toBe(200);
    sessionId = tableStateSchema.parse(await opened.json()).id;
    await page.goto("/");
    await page.getByRole("button", { name: "端末を接続する", exact: true }).click();
    const userCode = await page.getByLabel("端末に表示されたコード").textContent();
    const approved = await staff.post(`/api/admin/stores/${storeId}/devices/approve`, {
      headers,
      data: { userCode, tableId },
    });
    expect(approved.status()).toBe(200);
    await expect(page.getByRole("banner")).toContainText(vacant.name);
    await expect.poll(() => connected).toBeGreaterThan(0);

    const catalog = catalogSchema.parse(
      await (await page.request.get("/api/table/catalog")).json(),
    );
    const product = catalog.configuration.products.find(
      (item) => item.available && item.modifiers.length === 0,
    );
    if (!product) throw new Error("選択肢なしで注文できる商品がありません");
    const productId = product.id;
    const lineId = crypto.randomUUID();
    async function changeQuantity(quantity: number) {
      const before = tableStateSchema.parse(await (await page.request.get("/api/table")).json());
      const changed = await page.request.put("/api/table/cart", {
        headers,
        data: {
          expectedVersion: before.cart.version,
          lines: [{ id: lineId, productId, quantity, selections: [] }],
        },
      });
      expect(changed.status()).toBe(200);
      return tableStateSchema.parse(await changed.json());
    }
    await changeQuantity(1);
    await page.getByRole("button", { name: "注文内容を確認", exact: true }).click();
    const confirmation = page.getByRole("region", {
      name: "こちらの内容でよろしいですか？",
      exact: true,
    });
    await expect(confirmation).toContainText(product.text.ja.displayName);
    await expect(confirmation.getByText(/数量 1/)).toBeVisible();

    // 通知だけを失い、HTTPのevent再取得と実DBへの書込みは利用できる状態にする。
    dropped = true;
    await Promise.all(sockets.map((socket) => socket.close({ code: 1001 })));
    const changed = await changeQuantity(2);
    await expect(confirmation).not.toBeVisible();
    await page.getByRole("tab", { name: /^注文かご/ }).click();
    const basket = page.getByRole("tabpanel");
    await expect(basket.getByText(product.text.ja.displayName, { exact: true })).toHaveCount(1);
    await expect(basket.getByText(/数量 2/)).toBeVisible();

    // 実サーバーへ再接続し、新しい通知でも同じ行を重複追加しないことを確認する。
    const beforeReconnect = connected;
    dropped = false;
    await expect.poll(() => connected).toBeGreaterThan(beforeReconnect);
    const beforeNotification = notifications;
    await changeQuantity(3);
    await expect.poll(() => notifications).toBeGreaterThan(beforeNotification);
    await expect(basket.getByText(/数量 3/)).toBeVisible();
    await expect(basket.getByText(product.text.ja.displayName, { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "注文内容を確認", exact: true }).click();
    await expect(confirmation.getByText(/数量 3/)).toBeVisible();
    const latest = tableStateSchema.parse(await (await page.request.get("/api/table")).json());
    expect(latest.snapshot?.cartVersion).toBeGreaterThan(changed.cart.version);
    expect(latest.orders).toHaveLength(0);
    if (!latest.snapshot) throw new Error("再確認のsnapshotがありません");
    // APIの時計を変えず、ブラウザーの確認期限タイマーによる表示失効を検証する。
    await page.clock.fastForward(latest.snapshot.expiresAt - Date.now() + 1000);
    await expect(confirmation).not.toBeVisible();
  } finally {
    if (sessionId) {
      const response = await staff.get(`/api/admin/stores/${storeId}/tables/${sessionId}`);
      if (response.ok()) {
        const table = tableStateSchema.parse(await response.json());
        if (table.cart.lines.length) {
          const cleared = await page.request.put("/api/table/cart", {
            headers,
            data: { expectedVersion: table.cart.version, lines: [] },
          });
          expect(cleared.status()).toBe(200);
        }
        const closed = await staff.post(`/api/admin/stores/${storeId}/tables/${sessionId}/close`, {
          headers,
          data: {},
        });
        expect(closed.status()).toBe(200);
      }
    }
    await staff.post("/api/auth/sign-out", { headers, data: {} });
  }
});
