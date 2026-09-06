import { z } from "zod";
import { readFileSync } from "node:fs";
import { adminStateSchema, catalogSchema, tableStateSchema } from "@tablecast/api/schema";
import { expect, test } from "@playwright/test";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import type { CartLine } from "@tablecast/api/schema";
import { enlargeText, expectReadableControl, tabTo } from "./tablecast-accessibility";

const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../../../.local/demo.json", import.meta.url), "utf8")));

// スタッフの認証入力を含むため、通信traceを保存しない。
test.use({ trace: "off" });

for (const { staffLanguage, labels } of [
  { staffLanguage: "日本語", labels: ja },
  { staffLanguage: "英語", labels: en },
]) {
  test(`スタッフ画面が${staffLanguage}の場合に日英の端末認可・全種類のカスタマイズ注文・提供・会計を実DBへ反映する`, async ({
    page: staff,
    browser,
    baseURL,
  }, testInfo) => {
    const guestContext = await browser.newContext({
      baseURL,
      viewport: { width: 1024, height: 768 },
    });
    const guest = await guestContext.newPage();
    const storeId = "tablecast-komorebi";
    const tableId = `${storeId}-table-12`;
    let sessionId = "";
    try {
      await staff.goto("/login");
      await staff
        .getByRole("button", { name: staffLanguage === "英語" ? "English" : "日本語", exact: true })
        .click();
      await staff.getByLabel(labels.auth_email).fill(credentials.email);
      await staff.getByLabel(labels.auth_password, { exact: true }).fill(credentials.password);
      await staff.getByRole("button", { name: labels.auth_sign_in, exact: true }).click();
      await expect(staff).toHaveURL(/\/admin\/live$/);
      await staff
        .getByRole("combobox", { name: labels.admin_store, exact: true })
        .selectOption(storeId);
      const current = adminStateSchema.parse(
        await (await staff.request.get(`/api/admin/stores/${storeId}`)).json(),
      );
      const existing = current.tables.find((table) => table.tableId === tableId);
      if (existing) sessionId = existing.id;
      else {
        const opened = await staff.request.post(`/api/admin/stores/${storeId}/tables/open`, {
          data: { tableId, guestCount: 2, locale: "ja" },
        });
        expect(opened.ok()).toBeTruthy();
        const table = tableStateSchema.parse(await opened.json());
        sessionId = table.id;
        await staff.reload();
        await staff
          .getByRole("combobox", { name: labels.admin_store, exact: true })
          .selectOption(storeId);
      }
      await guest.goto("/");
      await guest.getByRole("button", { name: "端末を接続する" }).click();
      const code = await guest.getByLabel("端末に表示されたコード").textContent();
      expect(code).toBeTruthy();
      await staff.getByRole("button", { name: labels.admin_pair, exact: true }).click();
      await staff.getByLabel(labels.admin_pair_code).fill(code ?? "");
      await staff.getByLabel(labels.admin_pair_table).selectOption(tableId);
      await staff.getByRole("button", { name: labels.admin_approve, exact: true }).click();
      await expect(guest.locator(".restaurant-name")).toContainText("T12");
      await guest.getByRole("button", { name: "日本語", exact: true }).click();
      await expect(guest.getByRole("tab", { name: "おしながき", exact: true })).toBeVisible();
      const catalogue = catalogSchema.parse(
        await (await guest.request.get("/api/table/catalog")).json(),
      );
      const products = ["single", "multiple", "quantity"].map((kind) => {
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
      await guest.screenshot({ path: testInfo.outputPath("tablecast-kiosk-normal-ja.png") });
      // 客画面も文字を200%にして、常設操作と商品選択を実際に使う。
      await enlargeText(guest.locator(".kiosk-shell"));
      for (const name of ["日本語", "English", "音声を開始", "店員を呼ぶ"])
        await expectReadableControl(
          guest.locator("header").getByRole("button", { name, exact: true }),
        );
      const identity = await guest.locator(".restaurant-lockup").boundingBox();
      const controls = await guest.locator(".header-actions").boundingBox();
      if (!identity || !controls) throw new Error("ヘッダーの領域を取得できません。");
      expect(
        identity.x + identity.width <= controls.x + 1 ||
          identity.y + identity.height <= controls.y + 1,
      ).toBe(true);
      await expectReadableControl(guest.locator(".basket-total"));
      await guest.screenshot({ path: testInfo.outputPath("tablecast-kiosk-text-200-ja.png") });
      for (const product of products) {
        await test.step(`${product.text.ja.displayName}をカスタマイズする`, async () => {
          await guest.getByRole("tab", { name: "おしながき", exact: true }).click();
          await guest
            .getByRole("button")
            .filter({ has: guest.getByText(product.text.ja.displayName, { exact: true }) })
            .click();
          const title = guest.getByRole("heading", {
            name: product.text.ja.displayName,
            exact: true,
          });
          const originalSize = await title.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).fontSize),
          );
          await enlargeText(guest.getByRole("dialog"));
          expect(
            await title.evaluate((element) =>
              Number.parseFloat(getComputedStyle(element).fontSize),
            ),
          ).toBe(originalSize * 2);
          await expectReadableControl(
            guest.getByRole("button", { name: "注文かごに追加", exact: true }),
          );
          const selections: CartLine["selections"] = [];
          for (const modifier of product.modifiers) {
            const options = modifier.options.filter(
              (item) => item.available && !item.requires.length && !item.excludes.length,
            );
            const first = options[0];
            if (!first) throw new Error("選択可能な合成オプションがありません");
            if (modifier.kind === "single") {
              await guest
                .getByRole("radio", {
                  name: new RegExp(
                    first.text.ja.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  ),
                })
                .click();
              selections.push({ optionId: first.id, quantity: 1 });
            } else if (modifier.kind === "multiple") {
              const selected = options.slice(0, 2);
              expect(selected).toHaveLength(2);
              for (const option of selected) {
                const checkbox = guest.getByRole("checkbox", {
                  name: option.text.ja.displayName,
                  exact: true,
                });
                await checkbox.check();
                await expect(checkbox).toBeChecked();
                selections.push({ optionId: option.id, quantity: 1 });
              }
            } else {
              expect(first.maxQuantity).toBeGreaterThanOrEqual(2);
              const increase = guest.getByRole("button", {
                name: `${first.text.ja.displayName}: 数量を増やす`,
                exact: true,
              });
              await increase.click();
              await increase.click();
              selections.push({ optionId: first.id, quantity: 2 });
            }
          }
          const quantity = product.modifiers[0]?.kind === "quantity" ? 2 : 1;
          if (quantity === 2)
            await guest.getByRole("button", { name: "数量を増やす", exact: true }).click();
          await guest.getByRole("button", { name: "注文かごに追加", exact: true }).click();
          await expect(guest.getByRole("dialog")).not.toBeVisible();
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
      await expect(
        guest.getByRole("button", { name: "注文内容を確認", exact: true }),
      ).toBeEnabled();
      await expect(guest.getByRole("textbox")).toHaveCount(0);
      const voiceRequests: string[] = [];
      guest.on("request", (request) => {
        if (request.url().endsWith("/api/table/voice/start")) voiceRequests.push(request.url());
      });
      await guest
        .locator("header")
        .getByRole("button", { name: "音声を開始", exact: true })
        .click();
      await expect(
        guest.getByText("音声サービスの準備が整い次第ご利用いただけます。"),
      ).toBeVisible();
      await guest.getByRole("button", { name: "English", exact: true }).click();
      await expect(guest.getByRole("button", { name: "Review order", exact: true })).toBeEnabled();
      await expectReadableControl(guest.getByRole("button", { name: "Review order", exact: true }));
      await expectReadableControl(guest.locator(".basket-total"));
      for (const name of ["日本語", "English", "Reconnect voice", "Call staff"])
        await expectReadableControl(
          guest.locator("header").getByRole("button", { name, exact: true }),
        );
      expect(voiceRequests).toHaveLength(1);
      await expect(
        staff.getByRole("heading", { name: labels.admin_live, exact: true }),
      ).toBeVisible();
      await guest.screenshot({ path: testInfo.outputPath("tablecast-kiosk-landscape.png") });
      await guest.setViewportSize({ width: 768, height: 1024 });
      await expectReadableControl(guest.locator("header .language-switch"));
      for (const name of ["日本語", "English", "Reconnect voice", "Call staff"])
        await expectReadableControl(
          guest.locator("header").getByRole("button", { name, exact: true }),
        );
      await expect(
        guest.locator("header").getByRole("button", { name: "Reconnect voice", exact: true }),
      ).toBeInViewport();
      await guest.screenshot({ path: testInfo.outputPath("tablecast-kiosk-portrait.png") });
      await guest.setViewportSize({ width: 1024, height: 768 });
      await guest.getByRole("tab", { name: /^Your basket/ }).click();
      await tabTo(guest, guest.getByRole("button", { name: "Review order", exact: true }));
      await guest.keyboard.press("Enter");
      const reviewDialog = guest.getByRole("dialog");
      await enlargeText(reviewDialog);
      await expectReadableControl(
        reviewDialog.getByRole("button", { name: "Confirm and place order", exact: true }),
      );
      await guest.screenshot({
        path: testInfo.outputPath("tablecast-confirmation-text-200-en.png"),
      });
      for (const product of products)
        await expect(guest.getByRole("dialog")).toContainText(product.text.en.displayName);
      await tabTo(
        guest,
        guest.getByRole("button", { name: "Confirm and place order", exact: true }),
      );
      await guest.keyboard.press("Enter");
      await expect(guest.getByRole("heading", { name: "Your order is in" })).toBeVisible();
      await guest.getByRole("button", { name: "Close", exact: true }).click();
      const ordered = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
      expect(ordered.cart.lines).toHaveLength(0);
      expect(ordered.orders).toHaveLength(1);
      expect(ordered.orders[0]?.snapshot.lines).toEqual(basket.lines);
      await staff.getByRole("button", { name: /^T12/ }).click();
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
          const result = tableStateSchema.parse(
            await (await guest.request.get("/api/table")).json(),
          );
          return result.bill.due;
        })
        .toBe(0);
      await staff.getByRole("tab", { name: labels.admin_overview, exact: true }).click();
      await staff.getByRole("button", { name: labels.admin_close_session, exact: true }).click();
      await expect(guest.getByRole("heading", { name: "Thank you for joining us" })).toBeVisible();
    } finally {
      await guestContext.close();
      if (sessionId) {
        const latest = await staff.request.get(`/api/admin/stores/${storeId}/tables/${sessionId}`);
        if (latest.ok()) {
          const table = tableStateSchema.parse(await latest.json());
          if (table.status === "open" && table.bill.due === 0 && table.cart.lines.length === 0)
            await staff.request.post(`/api/admin/stores/${storeId}/tables/${sessionId}/close`, {
              data: {},
            });
        }
      }
    }
  });
}
