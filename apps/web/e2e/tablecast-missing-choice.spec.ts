import { test } from "./support/test";
import { expect } from "@playwright/test";
import {
  adminStateSchema,
  catalogSchema,
  tableStateSchema,
  type CartLine,
} from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

test.use({ trace: "off", actionTimeout: 15_000 });

test("外部の未完了カートを明示編集し、編集中の内容とカート版を保つ", async ({
  page,
  request: staff,
  baseURL,
}, testInfo) => {
  const storeId = "tablecast-komorebi";
  const base = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  let sessionId = "";
  expect(
    (await staff.post("/api/auth/sign-in/email", { data: credentials, headers })).status(),
  ).toBe(200);
  try {
    const stateResponse = await staff.get(base);
    expect(stateResponse.status()).toBe(200);
    const state = adminStateSchema.parse(await stateResponse.json());
    const vacant = state.vacantTables[0];
    if (!vacant) throw new Error("試験用の空卓が必要です。既存の利用卓は変更しません。");
    const tableId = vacant.id;
    const opened = await staff.post(`${base}/tables/open`, {
      headers,
      data: { tableId, guestCount: 2, locale: "ja" },
    });
    expect(opened.status()).toBe(200);
    sessionId = tableStateSchema.parse(await opened.json()).id;
    await page.goto("/");
    await page.getByRole("button", { name: ja.pair_begin, exact: true }).click();
    const userCode = await page.getByLabel(ja.admin_pair_code).textContent();
    expect(
      (
        await staff.post(`${base}/devices/approve`, { headers, data: { userCode, tableId } })
      ).status(),
    ).toBe(200);
    await expect(page.getByRole("banner").getByText(vacant.name, { exact: true })).toContainText(
      vacant.name,
    );
    const catalogResponse = await page.request.get("/api/table/catalog");
    expect(catalogResponse.status()).toBe(200);
    const catalog = catalogSchema.parse(await catalogResponse.json());
    const plain = catalog.configuration.products.find(
      (product) => product.available && product.modifiers.length === 0,
    );
    const customised = catalog.configuration.products.find(
      (product) =>
        product.available &&
        product.modifiers.some((group) => group.min > 0) &&
        product.modifiers.every(
          (group) =>
            group.min === 0 ||
            (group.kind === "single" &&
              group.min === 1 &&
              group.options.some((option) => option.available)),
        ),
    );
    if (!plain || !customised) throw new Error("必須選択の商品と選択肢なしの商品が必要です");
    const lineId = crypto.randomUUID();
    async function update(lines: CartLine[]) {
      const beforeResponse = await page.request.get("/api/table");
      expect(beforeResponse.status()).toBe(200);
      const before = tableStateSchema.parse(await beforeResponse.json());
      const changed = await page.request.put("/api/table/cart", {
        headers,
        data: { expectedVersion: before.cart.version, lines },
      });
      expect(changed.status()).toBe(200);
      return tableStateSchema.parse(await changed.json());
    }

    // 他の商品の入力中に音声側と同じ業務APIで未完了行を追加する。
    await page
      .getByRole("button", {
        name: new RegExp(plain.text.ja.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    const plainPage = page.getByRole("region", { name: plain.text.ja.displayName, exact: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await plainPage.getByRole("button", { name: ja.common_increase, exact: true }).click();
    await expect(
      plainPage.getByRole("status", { name: ja.common_quantity, exact: true }),
    ).toHaveText("2");
    const incomplete = await update([
      { id: lineId, productId: customised.id, quantity: 3, selections: [] },
    ]);
    expect(incomplete.cart.complete).toBe(false);
    await expect(page.locator("[data-ui='menu-tabs'] [data-ui='count']")).toHaveText("3");
    await expect(plainPage).toBeVisible();
    await expect(
      plainPage.getByRole("status", { name: ja.common_quantity, exact: true }),
    ).toHaveText("2");

    // 古い編集版で保存しても、外部更新を上書きせず画面内に競合を示す。
    const savingStale = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/table/cart" &&
        response.request().method() === "PUT",
    );
    await plainPage.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
    expect((await savingStale).status()).toBe(409);
    await expect(plainPage.getByRole("alert")).toContainText(ja.common_conflict);
    await expect(
      plainPage.getByRole("status", { name: ja.common_quantity, exact: true }),
    ).toHaveText("2");
    await plainPage.screenshot({ path: testInfo.outputPath("tablecast-cart-edit-conflict.png") });
    const unchanged = tableStateSchema.parse(await (await page.request.get("/api/table")).json());
    expect(unchanged.cart).toEqual(incomplete.cart);
    await plainPage.getByRole("button", { name: ja.kiosk_menu, exact: true }).click();

    // 未完了行は自動で開かず、カートの不足表示から明示的に編集する。
    const missingPage = page.getByRole("region", {
      name: customised.text.ja.displayName,
      exact: true,
    });
    await expect(missingPage).not.toBeVisible();
    await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
    await expect(
      page.getByRole("tabpanel").getByText(ja.kiosk_missing, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("tabpanel")
      .getByRole("button", { name: ja.kiosk_edit, exact: true })
      .click();
    await expect(missingPage).toBeVisible();
    await expect(
      missingPage.getByRole("status", { name: ja.common_quantity, exact: true }),
    ).toHaveText("3");
    await expect(missingPage.getByRole("alert")).not.toBeVisible();
    await missingPage.screenshot({ path: testInfo.outputPath("tablecast-missing-choice.png") });
    await missingPage.getByRole("button", { name: ja.kiosk_menu, exact: true }).click();
    expect((await page.request.post("/api/table/call", { headers, data: {} })).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: ja.kiosk_called_staff, exact: true }),
    ).toBeVisible();
    await expect(missingPage).not.toBeVisible();
    await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
    await page
      .getByRole("tabpanel")
      .getByRole("button", { name: ja.kiosk_edit, exact: true })
      .click();
    const selections: CartLine["selections"] = [];
    for (const group of customised.modifiers.filter((item) => item.min > 0)) {
      const index = group.options.findIndex((option) => option.available);
      const option = group.options[index];
      if (!option) throw new Error("選択可能な項目がありません");
      await missingPage
        .getByRole("radiogroup", { name: group.text.ja.displayName, exact: true })
        .getByRole("radio")
        .nth(index)
        .check();
      selections.push({ optionId: option.id, quantity: 1 });
    }
    const saving = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/table/cart" &&
        response.request().method() === "PUT",
    );
    await missingPage.getByRole("button", { name: ja.common_update, exact: true }).click();
    const savedResponse = await saving;
    expect(savedResponse.status()).toBe(200);
    const saved = tableStateSchema.parse(await savedResponse.json());
    expect(saved.cart.complete).toBe(true);
    expect(saved.cart.lines).toHaveLength(1);
    expect(saved.cart.lines[0]).toMatchObject({
      id: lineId,
      productId: customised.id,
      quantity: 3,
      selections,
    });
    await expect(missingPage).not.toBeVisible();

    // 次のカート版の不足も通知で開かず、同じ行を明示編集して新数量を引き継ぐ。
    await update([{ id: lineId, productId: customised.id, quantity: 4, selections: [] }]);
    await expect(
      page.getByRole("tabpanel").getByText(ja.kiosk_missing, { exact: true }),
    ).toBeVisible();
    await expect(missingPage).not.toBeVisible();
    await page
      .getByRole("tabpanel")
      .getByRole("button", { name: ja.kiosk_edit, exact: true })
      .click();
    await expect(missingPage).toBeVisible();
    await expect(
      missingPage.getByRole("status", { name: ja.common_quantity, exact: true }),
    ).toHaveText("4");
  } finally {
    try {
      if (sessionId) {
        const response = await staff.get(`${base}/tables/${sessionId}`);
        expect(response.status()).toBe(200);
        const table = tableStateSchema.parse(await response.json());
        if (table.cart.lines.length) {
          const cleared = await page.request.put("/api/table/cart", {
            headers,
            data: { expectedVersion: table.cart.version, lines: [] },
          });
          expect(cleared.status()).toBe(200);
        }
        const closed = await staff.post(`${base}/tables/${sessionId}/close`, { headers, data: {} });
        expect(closed.status()).toBe(200);
      }
    } finally {
      await staff.post("/api/auth/sign-out", { headers, data: {} });
    }
  }
});
