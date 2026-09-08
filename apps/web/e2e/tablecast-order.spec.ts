import { expect, test } from "@playwright/test";
import type { CartLine } from "@tablecast/api/schema";
import { adminStateSchema, catalogSchema, tableStateSchema } from "@tablecast/api/schema";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";
import { enlargeText, expectReadableControl, tabTo } from "./tablecast-accessibility";

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
    let sessionId = "";
    try {
      await staff.goto(`/login?returnTo=${encodeURIComponent(`/admin/stores/${storeId}/floor`)}`);
      await staff
        .getByRole("button", { name: staffLanguage === "英語" ? "English" : "日本語", exact: true })
        .click();
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
        data: { tableId, guestCount: 2, locale: "ja" },
      });
      expect(opened.ok()).toBeTruthy();
      const table = tableStateSchema.parse(await opened.json());
      sessionId = table.id;
      await staff.reload();
      await staff.goto(`/admin/stores/${storeId}/floor`);
      await guest.goto("/");
      await guest.getByRole("button", { name: "端末を接続する" }).click();
      const code = await guest.getByLabel("端末に表示されたコード").textContent();
      expect(code).toBeTruthy();
      await staff.goto(`/admin/stores/${storeId}/devices/new`);
      await staff.getByLabel(labels.admin_pair_code).fill(code ?? "");
      await staff
        .getByRole("row")
        .filter({ has: staff.getByRole("cell", { name: vacant.name, exact: true }) })
        .getByRole("button")
        .click();
      await staff.getByRole("button", { name: labels.admin_approve, exact: true }).click();
      await expect(guest.getByRole("banner").getByText(vacant.name, { exact: true })).toBeVisible();
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
      await enlargeText(guest.locator("[data-ui='kiosk-shell']"));
      for (const name of ["日本語", "English", "店員を呼ぶ"])
        await expectReadableControl(
          guest.getByRole("banner").getByRole("button", { name, exact: true }),
        );
      await expectReadableControl(
        guest.locator("footer").getByRole("button", { name: ja.kiosk_voice_resume, exact: true }),
      );
      const identity = await guest
        .getByRole("banner")
        .getByText(vacant.name, { exact: true })
        .boundingBox();
      if (!identity) throw new Error("卓名の領域を取得できません。");
      for (const control of await guest.getByRole("banner").getByRole("button").all()) {
        const bounds = await control.boundingBox();
        if (!bounds) throw new Error("ヘッダー操作の領域を取得できません。");
        expect(
          identity.x + identity.width <= bounds.x + 1 ||
            identity.y + identity.height <= bounds.y + 1 ||
            bounds.x + bounds.width <= identity.x + 1 ||
            bounds.y + bounds.height <= identity.y + 1,
        ).toBe(true);
      }
      await expectReadableControl(guest.locator("[data-ui='basket-total']"));
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
          const productPage = guest.getByRole("region", {
            name: product.text.ja.displayName,
            exact: true,
          });
          await expect(productPage).toBeVisible();
          await expect(guest.getByRole("dialog")).toHaveCount(0);
          await enlargeText(productPage);
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
          await expect(productPage).not.toBeVisible();
          await expect(guest.getByRole("tab", { name: /^注文かご/ })).toHaveAttribute(
            "aria-selected",
            "true",
          );
          chosen.push({ productId: product.id, quantity, selections });
          if (chosen.length === 1) {
            const initial = tableStateSchema.parse(
              await (await guest.request.get("/api/table")).json(),
            ).cart;
            for (const nextQuantity of [2, 1]) {
              await guest
                .getByRole("button", {
                  name: `${product.text.ja.displayName}: ${nextQuantity === 2 ? ja.common_increase : ja.common_decrease}`,
                  exact: true,
                })
                .click();
              await expect
                .poll(async () => {
                  const updatedCart = tableStateSchema.parse(
                    await (await guest.request.get("/api/table")).json(),
                  ).cart;
                  return {
                    quantity: updatedCart.lines[0]?.quantity,
                    selections: updatedCart.lines[0]?.selections,
                    total: updatedCart.total,
                  };
                })
                .toEqual({
                  quantity: nextQuantity,
                  selections,
                  total: initial.total * nextQuantity,
                });
            }
          }
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
      // 外部資格の有無に依存せず、音声失敗時のGUI継続だけを検証する。
      await guest.route("**/api/table/voice/start", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "VOICE_NOT_CONFIGURED" } }),
        }),
      );
      await guest
        .locator("footer")
        .getByRole("button", { name: ja.kiosk_voice_resume, exact: true })
        .click();
      await expect(
        guest.getByText("音声サービスの準備が整い次第ご利用いただけます。"),
      ).toBeVisible();
      await guest.getByRole("button", { name: "English", exact: true }).click();
      await expect(guest.getByRole("button", { name: "Review order", exact: true })).toBeEnabled();
      await guest.screenshot({ path: testInfo.outputPath("tablecast-kiosk-landscape.png") });
      await expectReadableControl(guest.getByRole("button", { name: "Review order", exact: true }));
      await expectReadableControl(guest.locator("[data-ui='basket-total']"));
      for (const name of ["日本語", "English", "Call staff"])
        await expectReadableControl(
          guest.getByRole("banner").getByRole("button", { name, exact: true }),
        );
      await expectReadableControl(
        guest.locator("footer").getByRole("button", { name: en.kiosk_voice_retry, exact: true }),
      );
      expect(voiceRequests).toHaveLength(1);
      await staff.goto(`/admin/stores/${storeId}/floor`);
      await expect(
        staff.getByRole("heading", { name: labels.admin_live, exact: true }),
      ).toBeVisible();
      await guest.setViewportSize({ width: 768, height: 1024 });
      await expectReadableControl(guest.getByRole("banner").locator("[data-ui='language-switch']"));
      for (const name of ["日本語", "English", "Call staff"])
        await expectReadableControl(
          guest.getByRole("banner").getByRole("button", { name, exact: true }),
        );
      await expectReadableControl(
        guest.locator("footer").getByRole("button", { name: en.kiosk_voice_retry, exact: true }),
      );
      await guest.screenshot({ path: testInfo.outputPath("tablecast-kiosk-portrait.png") });
      await guest.setViewportSize({ width: 1024, height: 768 });
      await guest.getByRole("tab", { name: /^Your basket/ }).click();
      await tabTo(guest, guest.getByRole("button", { name: "Review order", exact: true }));
      await guest.keyboard.press("Enter");
      const review = guest.getByRole("region", { name: en.kiosk_review_title, exact: true });
      await expect(review).toBeVisible();
      await expect(guest.getByRole("dialog")).toHaveCount(0);
      await enlargeText(review);
      await guest.screenshot({
        path: testInfo.outputPath("tablecast-confirmation-text-200-en.png"),
      });
      await expectReadableControl(
        review.getByRole("button", { name: "Confirm and place order", exact: true }),
      );
      for (const product of products)
        await expect(review).toContainText(product.text.en.displayName);
      await tabTo(
        guest,
        guest.getByRole("button", { name: "Confirm and place order", exact: true }),
      );
      await guest.keyboard.press("Enter");
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
          const result = tableStateSchema.parse(
            await (await guest.request.get("/api/table")).json(),
          );
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
      try {
        if (sessionId) {
          const sessionPath = `/api/admin/stores/${storeId}/tables/${sessionId}`;
          const latest = await staff.request.get(sessionPath);
          expect(latest.status()).toBe(200);
          const table = tableStateSchema.parse(await latest.json());
          if (table.status === "open") {
            // この試験で新規作成した来店だけを、失敗時にも空席へ戻す。
            if (table.cart.lines.length) {
              const cleared = await guest.request.put("/api/table/cart", {
                data: { expectedVersion: table.cart.version, lines: [] },
              });
              expect(cleared.status()).toBe(200);
            }
            for (const order of table.orders.filter((item) =>
              ["submitted", "accepted"].includes(item.status),
            )) {
              const cancelled = await staff.request.post(
                `/api/admin/stores/${storeId}/orders/${order.id}/status`,
                { data: { status: "cancelled" } },
              );
              expect(cancelled.status()).toBe(200);
            }
            const current = tableStateSchema.parse(
              await (await staff.request.get(sessionPath)).json(),
            );
            if (current.bill.due > 0) {
              const paid = await staff.request.post(`${sessionPath}/payments`, {
                data: {
                  amount: current.bill.due,
                  idempotencyKey: `tablecast-e2e-cleanup-${sessionId}`,
                  kind: "payment",
                  reason: "注文E2Eの専用来店を後片付けするテスト支払",
                },
              });
              expect(paid.status()).toBe(200);
            }
            const closed = await staff.request.post(`${sessionPath}/close`, { data: {} });
            expect(closed.status()).toBe(200);
          }
        }
      } finally {
        await guestContext.close();
      }
    }
  });
}
