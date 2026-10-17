import { test } from "./support/test";
import { expect } from "@playwright/test";
import type { CartLine } from "@tablecast/api/schema";
import { adminStateSchema, catalogSchema, tableStateSchema } from "@tablecast/api/schema";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

// スタッフの認証入力を含むため、通信traceを保存しない。
test.use({ trace: "off", actionTimeout: 15_000 });

const labels = ja;
test("日本語のスタッフと英語の客が端末認可・カスタマイズ注文・提供・会計を実DBへ反映する", async ({
  page: staff,
  browser,
  baseURL,
}) => {
  const guestContext = await browser.newContext({
    baseURL,
    viewport: { width: 1024, height: 768 },
  });
  const guest = await guestContext.newPage();
  const storeId = "tablecast-komorebi";
  try {
    await staff.goto(`/login?returnTo=${encodeURIComponent(`/admin/stores/${storeId}/floor`)}`);
    await staff.getByRole("button", { name: "日本語", exact: true }).click();
    await staff.getByLabel(labels.auth_email).fill(credentials.email);
    await staff.getByLabel(labels.auth_password, { exact: true }).fill(credentials.password);
    await staff.getByRole("button", { name: labels.auth_sign_in, exact: true }).click();
    await expect(staff).toHaveURL(new RegExp(`/admin/stores/${storeId}/floor$`));
    await expect(staff.getByRole("main")).toBeVisible();
    const current = adminStateSchema.parse(
      await (await staff.request.get(`/api/admin/stores/${storeId}`)).json(),
    );
    const vacant = current.vacantTables[0];
    if (!vacant) throw new Error("試験用の空卓が必要です。既存の利用卓は変更しません。");
    const tableId = vacant.id;
    const opened = await staff.request.post(`/api/admin/stores/${storeId}/tables/open`, {
      data: { tableId, guestCount: 2, locale: "en" },
    });
    expect(opened.ok()).toBeTruthy();
    tableStateSchema.parse(await opened.json());
    await guest.goto("/");
    await guest.getByRole("button", { name: "English", exact: true }).click();
    await guest.getByRole("button", { name: en.pair_begin, exact: true }).click();
    const pairingCode = guest.getByLabel(en.admin_pair_code);
    await expect(pairingCode).toHaveText(/\S+/);
    const code = await pairingCode.textContent();
    await staff.goto(`/admin/stores/${storeId}/devices/new`);
    await staff.getByLabel(labels.admin_pair_code).fill(code ?? "");
    await expect(staff.getByLabel(labels.admin_pair_code)).toHaveValue(code ?? "");
    await staff
      .getByRole("row")
      .filter({ has: staff.getByRole("cell", { name: vacant.name, exact: true }) })
      .getByRole("button")
      .click();
    await expect(
      staff
        .getByRole("row")
        .filter({ has: staff.getByRole("cell", { name: vacant.name, exact: true }) })
        .getByRole("button"),
    ).toHaveAttribute("aria-pressed", "true");
    await staff.getByRole("button", { name: labels.admin_approve, exact: true }).click();
    await expect(guest.getByRole("banner").getByText(vacant.name, { exact: true })).toBeVisible();
    await expect(guest.getByRole("tab", { name: en.kiosk_menu, exact: true })).toBeVisible();
    const catalogue = catalogSchema.parse(
      await (await guest.request.get("/api/table/catalog")).json(),
    );
    const products = ["single"].map((kind) => {
      const product = catalogue.configuration.products.find(
        (item) =>
          item.available &&
          item.modifiers.length > 0 &&
          item.modifiers.every((modifier) => modifier.kind === kind),
      );
      if (!product) throw new Error(`${kind}の合成商品がありません`);
      return product;
    });
    const chosen: Pick<CartLine, "productId" | "quantity" | "selections">[] = [];
    // 全modifier・文字拡大・音声失敗の分岐は部品とWebアプリ統合で所有する。
    for (const product of products) {
      await test.step(`${product.text.en.displayName}をカスタマイズする`, async () => {
        await guest.getByRole("tab", { name: en.kiosk_menu, exact: true }).click();
        await guest
          .getByRole("button")
          .filter({ has: guest.getByText(product.text.en.displayName, { exact: true }) })
          .click();
        const productPage = guest.getByRole("region", {
          name: product.text.en.displayName,
          exact: true,
        });
        await expect(productPage).toBeVisible();
        await expect(guest.getByRole("dialog")).toHaveCount(0);
        const selections: CartLine["selections"] = [];
        for (const modifier of product.modifiers) {
          const options = modifier.options.filter(
            (item) => item.available && !item.requires.length && !item.excludes.length,
          );
          const first = options[0];
          if (!first) throw new Error("選択可能な合成オプションがありません");
          await guest
            .getByRole("radio", {
              name: new RegExp(first.text.en.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
            })
            .click();
          selections.push({ optionId: first.id, quantity: 1 });
        }
        const quantity = 1;
        await guest.getByRole("button", { name: en.kiosk_add, exact: true }).click();
        await expect(productPage).not.toBeVisible();
        await expect(
          guest.getByRole("tab", { name: new RegExp(`^${en.kiosk_cart}`) }),
        ).toHaveAttribute("aria-selected", "true");
        chosen.push({ productId: product.id, quantity, selections });
      });
    }
    const basket = tableStateSchema.parse(
      await (await guest.request.get("/api/table")).json(),
    ).cart;
    expect(basket.complete).toBe(true);
    expect(
      basket.lines.map(({ productId, quantity, selections }) => ({
        productId,
        quantity,
        selections,
      })),
    ).toEqual(chosen);
    await expect(guest.getByRole("textbox")).toHaveCount(0);
    await expect(guest.getByRole("button", { name: "Review order", exact: true })).toBeEnabled();
    await staff.goto(`/admin/stores/${storeId}/floor`);
    await expect(
      staff.getByRole("heading", { name: labels.admin_live, exact: true }),
    ).toBeVisible();
    await guest.getByRole("tab", { name: /^Your basket/ }).click();
    await guest.getByRole("button", { name: "Review order", exact: true }).click();
    const review = guest.getByRole("region", { name: en.kiosk_review_title, exact: true });
    await expect(review).toBeVisible();
    await expect(guest.getByRole("dialog")).toHaveCount(0);
    for (const product of products) await expect(review).toContainText(product.text.en.displayName);
    await guest.getByRole("button", { name: "Confirm and place order", exact: true }).click();
    await expect(guest.getByText(en.kiosk_ordered, { exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Close", exact: true }).click();
    const ordered = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
    expect(ordered.cart.lines).toHaveLength(0);
    expect(ordered.orders).toHaveLength(1);
    expect(ordered.orders[0]?.snapshot.lines).toEqual(basket.lines);
    expect(ordered.billRequested).toBe(false);
    await staff.goto(`/admin/stores/${storeId}/floor`);
    const billingMetric = staff
      .locator("[data-slot=metric]")
      .filter({ has: staff.getByText(labels.admin_billing, { exact: true }) })
      .locator("strong");
    const previousBilling = Number(await billingMetric.innerText());
    await guest.getByRole("tab", { name: en.kiosk_bill, exact: true }).click();
    await guest.getByRole("button", { name: en.kiosk_bill_request, exact: true }).click();
    await expect(billingMetric).toHaveText(String(previousBilling + 1));
    await staff.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }).click();
    await staff.getByRole("tab", { name: labels.admin_orders, exact: true }).click();
    await staff.getByRole("button", { name: labels.admin_accept, exact: true }).click();
    await staff.getByRole("button", { name: labels.admin_serve, exact: true }).click();
    await expect(staff.getByText(labels.order_served, { exact: true })).toBeVisible();
    await staff.getByRole("tab", { name: labels.admin_payments, exact: true }).click();
    await staff.getByLabel(labels.admin_amount, { exact: true }).fill(String(ordered.bill.due));
    await staff.getByLabel(labels.admin_reason, { exact: true }).fill("店頭支払のE2E確認");
    await staff.getByRole("button", { name: labels.admin_payment, exact: true }).click();
    await expect
      .poll(async () => {
        const result = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
        return result.bill.due;
      })
      .toBe(0);
    await staff.goto(`/admin/stores/${storeId}/floor`);
    await expect(billingMetric).toHaveText(String(previousBilling));
    await staff.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }).click();
    await staff.getByRole("tab", { name: labels.admin_overview, exact: true }).click();
    await staff.getByRole("button", { name: labels.admin_close_session, exact: true }).click();
    await expect(guest.getByRole("heading", { name: "Thank you for joining us" })).toBeVisible();
  } finally {
    // DBとWorkerはcase専用fixtureが破棄する。後片付けのHTTPで元の失敗を上書きしない。
    await guestContext.close();
  }
});
