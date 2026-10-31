import { expect, type WebSocketRoute } from "@playwright/test";
import { adminStateSchema, catalogSchema, tableStateSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { approveGuestDevice, signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ serviceWorkers: "block" });

test("実WebSocketの通知切断中はHTTPで回復し、再接続後の変更も画面へ反映する", async ({
  page,
  request: staff,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  const headers = { Origin: baseURL ?? "" };
  await signInStaff(staff, baseURL);
  const stateResponse = await staff.get(`/api/admin/stores/${storeId}`);
  expect(stateResponse.status()).toBe(200);
  const vacant = adminStateSchema.parse(await stateResponse.json()).vacantTables[0];
  if (!vacant) throw new Error("試験用の空卓が必要です。既存の利用卓は変更しません。");
  const tableId = vacant.id;
  let dropped = false;
  let connected = 0;
  let notifications = 0;
  const sockets: WebSocketRoute[] = [];
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
  const opened = await staff.post(`/api/admin/stores/${storeId}/tables/open`, {
    headers,
    data: { tableId, guestCount: 2, locale: "ja" },
  });
  expect(opened.status()).toBe(200);
  await approveGuestDevice(page.request, staff, { origin: baseURL, storeId, tableId });
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText(vacant.name);
  await expect.poll(() => connected).toBeGreaterThan(0);

  const catalog = catalogSchema.parse(await (await page.request.get("/api/table/catalog")).json());
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
  await page.getByRole("tab", { name: /^注文かご/ }).click();
  const basket = page.getByRole("tabpanel");
  const quantity = basket.getByRole("textbox", {
    name: `${product.text.ja.displayName}: ${ja.common_quantity}`,
    exact: true,
  });
  await expect(quantity).toHaveValue("1");

  // 通知だけを失い、HTTPのevent再取得と実DBへの書込みは利用できる状態にする。
  dropped = true;
  await Promise.all(sockets.map((socket) => socket.close({ code: 1001 })));
  await changeQuantity(2);
  await expect(basket.getByText(product.text.ja.displayName, { exact: true })).toHaveCount(1);
  await expect(quantity).toHaveValue("2");

  // 実サーバーへ再接続し、新しい通知でも同じ行を重複追加しないことを確認する。
  const beforeReconnect = connected;
  dropped = false;
  await expect.poll(() => connected).toBeGreaterThan(beforeReconnect);
  const beforeNotification = notifications;
  await changeQuantity(3);
  await expect.poll(() => notifications).toBeGreaterThan(beforeNotification);
  await expect(quantity).toHaveValue("3");
  await expect(basket.getByText(product.text.ja.displayName, { exact: true })).toHaveCount(1);
});
