import type { CartLine } from "@tablecast/api/schema";
import { expect } from "@playwright/test";
import { adminStateSchema, catalogSchema, tableStateSchema } from "@tablecast/api/schema";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { fixtureValue } from "../src/test-support/fixture-value";
import { signInFromLogin } from "./support/session";
import { test } from "./support/test";

// スタッフの認証入力を含むため、通信traceを保存しない。
test.use({ trace: "off", actionTimeout: 15_000, serviceWorkers: "block" });

const labels = ja;
test("英語の客が端末認可後に日本語へ切り替え、スタッフと注文・提供・会計を実DBへ反映する", async ({
  page: staff,
  browser,
  baseURL,
  browserName,
}, testInfo) => {
  let guestContext = await browser.newContext({
    baseURL,
    viewport: { width: 1024, height: 768 },
    serviceWorkers: "block",
  });
  let guest = await guestContext.newPage();
  const storeId = "tablecast-komorebi";
  try {
    await staff.goto(`/login?returnTo=${encodeURIComponent(`/admin/stores/${storeId}/floor`)}`);
    await staff.getByRole("button", { name: "日本語", exact: true }).click();
    await signInFromLogin(staff, baseURL);
    await expect(staff).toHaveURL(new RegExp(`/admin/stores/${storeId}/floor$`));
    await expect(staff.getByRole("main")).toBeVisible();
    const current = adminStateSchema.parse(
      await (await staff.request.get(`/api/admin/stores/${storeId}`)).json(),
    );
    const vacant = current.vacantTables.find((table) => table.name === "T10");
    if (!vacant) throw new Error("専用fixtureのT10が空席ではありません。");
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
      .filter({ has: staff.getByRole("rowheader", { name: vacant.name, exact: true }) })
      .getByRole("button")
      .click();
    await expect(
      staff
        .getByRole("row")
        .filter({ has: staff.getByRole("rowheader", { name: vacant.name, exact: true }) })
        .getByRole("button"),
    ).toHaveAttribute("aria-pressed", "true");
    await staff.getByRole("button", { name: labels.admin_approve, exact: true }).click();
    await expect(guest.getByRole("banner").getByText(vacant.name, { exact: true })).toBeVisible();
    await expect(guest.getByRole("tab", { name: en.kiosk_menu, exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "日本語", exact: true }).click();
    await expect(guest.getByRole("tab", { name: ja.kiosk_menu, exact: true })).toBeVisible();
    await guest.getByRole("combobox", { name: ja.currency_select, exact: true }).click();
    await guest.getByRole("option", { name: /USD/ }).click();
    // 認証入力・ペアリングコードを映さず、承認済みの注文画面から収録する。
    const recording = await browser.newContext({
      baseURL,
      storageState: await guestContext.storageState(),
      viewport: { width: 1024, height: 768 },
      serviceWorkers: "block",
      recordVideo: {
        dir: testInfo.outputPath("tablecast-order-ui-video"),
        size: { width: 1024, height: 768 },
      },
    });
    await guestContext.close();
    guestContext = recording;
    guest = await guestContext.newPage();
    await guest.emulateMedia({
      reducedMotion: browserName === "webkit" ? "reduce" : "no-preference",
    });
    await guest.goto("/");
    await guest.evaluate(() => {
      document.documentElement.dataset.tablecastCartFlights = "0";
      document.documentElement.dataset.tablecastOrderFlights = "0";
      document.documentElement.dataset.tablecastFlightsInViewport = "true";
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            if (
              node instanceof Element &&
              node.matches('[data-ui="cart-flight"], [data-ui="order-flight"]')
            ) {
              const key = node.matches('[data-ui="cart-flight"]')
                ? "tablecastCartFlights"
                : "tablecastOrderFlights";
              document.documentElement.dataset[key] = String(
                Number(document.documentElement.dataset[key]) + 1,
              );
              const bounds = node.getBoundingClientRect();
              if (
                bounds.left < 0 ||
                bounds.top < 0 ||
                bounds.right > innerWidth ||
                bounds.bottom > innerHeight
              ) {
                document.documentElement.dataset.tablecastFlightsInViewport = "false";
                document.documentElement.dataset.tablecastFlightViolation = JSON.stringify({
                  kind: node.getAttribute("data-ui"),
                  bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
                  viewport: [innerWidth, innerHeight],
                });
              }
            }
          }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await expect(guest.getByRole("tab", { name: ja.kiosk_menu, exact: true })).toBeVisible();
    await expect(guest.locator('[data-ui="store-logo-banner"] img')).toBeVisible();
    await expect(guest.locator('[data-ui="store-logo-banner"] img')).toHaveJSProperty(
      "complete",
      true,
    );
    expect(
      await guest
        .locator('[data-ui="store-logo-banner"] img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);
    await expect(guest.locator('[data-ui="tab-price"] [aria-label]')).toHaveCount(2);
    await guest.screenshot({ path: testInfo.outputPath("tablecast-menu.png") });
    const catalogue = catalogSchema.parse(
      await (await guest.request.get("/api/table/catalog")).json(),
    );
    const customised = catalogue.configuration.products.find(
      (item) =>
        item.available &&
        item.imageKey &&
        item.modifiers.length > 0 &&
        item.modifiers.every((modifier) => modifier.kind === "single"),
    );
    if (!customised) throw new Error("単一選択の商品が必要です");
    const simpleByCategory = new Map(
      catalogue.configuration.products
        .filter(
          (item) =>
            item.available &&
            item.imageKey &&
            item.modifiers.length === 0 &&
            item.categoryId !== customised.categoryId,
        )
        .map((item) => [item.categoryId, item]),
    );
    const products = [customised, ...Array.from(simpleByCategory.values()).slice(0, 2)];
    if (products.length !== 3) throw new Error("複数商品を確認するため3商品が必要です");
    const chosen: Pick<CartLine, "productId" | "quantity" | "selections">[] = [];
    // 全modifier・文字拡大・音声失敗の分岐は部品とWebアプリ統合で所有する。
    for (const product of products) {
      await test.step(`${product.text.ja.displayName}をカスタマイズする`, async () => {
        const menuTab = guest.getByRole("tab", { name: ja.kiosk_menu, exact: true });
        await menuTab.click();
        await expect(menuTab).toHaveAttribute("aria-selected", "true");
        await guest
          .getByRole("tabpanel")
          .getByRole("button")
          .filter({ has: guest.getByText(product.text.ja.displayName, { exact: true }) })
          .click();
        const productPage = guest.getByRole("region", {
          name: product.text.ja.displayName,
          exact: true,
        });
        await expect(productPage).toBeVisible();
        await expect(
          guest.getByRole("dialog", { name: product.text.ja.displayName, exact: true }),
        ).toBeVisible();
        const selections: CartLine["selections"] = [];
        for (const modifier of product.modifiers) {
          const options = modifier.options.filter(
            (item) => item.available && !item.requires.length && !item.excludes.length,
          );
          const first = options[0];
          if (!first) throw new Error("選択可能な合成オプションがありません");
          await productPage
            .getByRole("group", {
              name: new RegExp(
                `^${modifier.text.ja.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
              ),
            })
            .getByRole("radio", { name: first.text.ja.displayName, exact: true })
            .click();
          selections.push({ optionId: first.id, quantity: 1 });
        }
        if (product.id === customised.id)
          await guest.screenshot({ path: testInfo.outputPath("tablecast-product-dialog.png") });
        const quantity = 1;
        await productPage.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
        await expect(productPage).not.toBeVisible();
        await expect(
          guest.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }),
        ).toHaveAttribute("aria-selected", "true");
        chosen.push({ productId: product.id, quantity, selections });
      });
    }
    await expect(guest.getByText(ja.kiosk_cart_added, { exact: true }).first()).toBeVisible();
    await expect(guest.getByText(ja.kiosk_cart_empty, { exact: true })).not.toBeVisible();
    await guest.screenshot({ path: testInfo.outputPath("tablecast-basket-toast.png") });
    const basketToasts = guest
      .getByRole("dialog", { name: ja.kiosk_cart_added, exact: true })
      .and(guest.locator(":not([data-ending-style])"));
    while (await basketToasts.count()) {
      await basketToasts
        .first()
        .getByRole("button", { name: ja.common_close, exact: true })
        .click();
    }
    if (browserName === "chromium") {
      // 実データのカゴを各端末のCSS viewportで撮影する。
      for (const [width, height] of [
        [1512, 982],
        [1180, 820],
        [820, 1180],
        [402, 874],
      ] as const) {
        const preview = await browser.newContext({
          baseURL,
          storageState: await guestContext.storageState(),
          viewport: { width, height },
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        try {
          const responsive = await preview.newPage();
          await responsive.goto("/");
          await expect(responsive.getByRole("tab")).toHaveCount(3);
          await expect(
            responsive.getByRole("button", { name: ja.kiosk_review, exact: true }),
          ).toBeVisible();
          await expect(responsive.locator('[data-ui="cart-preview"] img')).toHaveCount(
            products.length,
          );
          await expect(responsive.locator('[data-ui="tab-price"] [aria-label]')).toHaveCount(2);
          const branding = await responsive
            .locator('[data-ui="store-logo-banner"]')
            .evaluate((element) => {
              const image = element.querySelector("img");
              const caption = element.querySelector("div");
              const name = caption?.querySelector("span");
              if (!image || !caption || !name) throw new Error("店舗バナー・店名・卓名が必要です");
              const picture = image.getBoundingClientRect();
              const text = caption.getBoundingClientRect();
              return {
                imageCenter: picture.top + picture.height / 2,
                textCenter: text.top + text.height / 2,
                imageRight: picture.right,
                textLeft: text.left,
                nameWidth: name.clientWidth,
                nameContentWidth: name.scrollWidth,
              };
            });
          expect(branding.imageCenter).toBeCloseTo(branding.textCenter, 0);
          expect(branding.textLeft).toBeGreaterThan(branding.imageRight);
          expect(branding.nameContentWidth).toBeLessThanOrEqual(branding.nameWidth + 1);
          await responsive.screenshot({
            path: testInfo.outputPath(`tablecast-basket-${width}.png`),
          });
        } finally {
          await preview.close();
        }
      }
    }
    const flights = await guest.evaluate(() =>
      Number(document.documentElement.dataset.tablecastCartFlights),
    );
    expect(flights).toBe(browserName === "webkit" ? 0 : products.length);
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
    await expect(guest.getByRole("textbox")).toHaveCount(products.length);
    await expect(
      guest.getByRole("textbox", { name: new RegExp(`${ja.common_quantity}$`) }).first(),
    ).toHaveValue("1");
    await expect(guest.getByRole("button", { name: ja.kiosk_review, exact: true })).toBeEnabled();
    await staff.goto(`/admin/stores/${storeId}/floor`);
    await expect(
      staff.getByRole("heading", { name: labels.admin_live, exact: true }),
    ).toBeVisible();
    await guest.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
    await guest.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
    const review = guest.getByRole("region", { name: ja.kiosk_review_title, exact: true });
    await expect(review).toBeVisible();
    await expect(guest.locator('[data-theme-part="dialog"]')).toHaveCount(0);
    for (const product of products) await expect(review).toContainText(product.text.ja.displayName);
    await guest.getByRole("button", { name: ja.kiosk_confirm, exact: true }).click();
    const orderNotice = guest.getByRole("dialog", { name: ja.kiosk_ordered, exact: true });
    await expect(orderNotice).toBeVisible();
    expect(
      await guest.evaluate(() => Number(document.documentElement.dataset.tablecastOrderFlights)),
    ).toBe(browserName === "webkit" ? 0 : products.length);
    expect(
      await guest.evaluate(() => document.documentElement.dataset.tablecastFlightsInViewport),
      await guest.evaluate(() => document.documentElement.dataset.tablecastFlightViolation),
    ).toBe("true");
    await expect(guest.locator('[data-ui="orders-preview"] img')).toHaveCount(products.length);
    await orderNotice.getByRole("button", { name: ja.common_close, exact: true }).click();
    const ordered = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
    expect(ordered.cart.lines).toHaveLength(0);
    expect(ordered.orders).toHaveLength(1);
    expect(ordered.orders[0]?.snapshot.lines).toEqual(basket.lines);
    expect(ordered.billRequested).toBe(false);
    await guest.getByRole("tab", { name: new RegExp(`^${ja.kiosk_orders_bill}`) }).click();
    const history = guest.locator('[data-ui="order-card"]');
    await expect(history).toBeVisible();
    // snapshotの名称・金額を保ったまま現在カタログの写真を添える。
    const historyImages = basket.lines.reduce((sum, line) => {
      const product = catalogue.configuration.products.find((item) => item.id === line.productId);
      return (
        sum +
        (product?.imageKey ? 1 : 0) +
        line.options.filter((option) =>
          product?.modifiers
            .flatMap((group) => group.options)
            .some((item) => item.id === option.id && item.imageKey),
        ).length
      );
    }, 0);
    expect(historyImages).toBeGreaterThan(1);
    await expect(history.locator("img")).toHaveCount(historyImages);
    await expect(guest.getByRole("tabpanel")).toHaveCSS("opacity", "1");
    await expect(guest.getByRole("banner")).toBeInViewport();
    await guest.screenshot({ path: testInfo.outputPath("tablecast-history.png") });
    await staff.goto(`/admin/stores/${storeId}/floor`);
    const billingMetric = staff
      .getByRole("region", { name: labels.floor_current, exact: true })
      .getByRole("button")
      .filter({ has: staff.getByText(labels.admin_billing, { exact: true }) })
      .locator("strong");
    const beforeBillRequest = adminStateSchema.parse(
      await (await staff.request.get(`/api/admin/stores/${storeId}`)).json(),
    );
    const previousBilling = beforeBillRequest.tables.filter(
      (table) => table.billRequested && table.bill.due > 0,
    ).length;
    await expect(billingMetric).toHaveText(String(previousBilling));
    await guest.getByRole("tab", { name: new RegExp(`^${ja.kiosk_orders_bill}`) }).click();
    await guest.getByRole("button", { name: ja.kiosk_bill_request, exact: true }).click();
    await expect(billingMetric).toHaveText(String(previousBilling + 1));
    await staff.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }).click();
    await expect(staff).toHaveURL(
      (url) => url.pathname === `/admin/stores/${storeId}/visits/${ordered.id}`,
    );
    await staff.getByRole("tab", { name: labels.admin_orders, exact: true }).click();
    const order = staff
      .getByRole("tabpanel")
      .getByRole("article")
      .filter({
        has: staff.getByText(fixtureValue(products[0]).text.ja.displayName, { exact: true }),
      });
    await order.getByRole("button", { name: labels.admin_accept, exact: true }).click();
    const serve = order.getByRole("button", { name: labels.admin_serve, exact: true });
    await expect(serve).toBeEnabled();
    await serve.click();
    await expect(order.getByText(labels.order_served, { exact: true })).toBeVisible();
    await staff.getByRole("tab", { name: labels.admin_payments, exact: true }).click();
    const payment = staff
      .getByRole("tabpanel")
      .locator("form")
      .filter({
        has: staff.getByLabel(labels.admin_amount, { exact: true }),
      });
    const amount = payment.getByLabel(labels.admin_amount, { exact: true });
    await amount.fill(String(ordered.bill.due));
    await payment.getByLabel(labels.admin_reason, { exact: true }).fill("店頭支払のE2E確認");
    const pay = payment.getByRole("button", { name: labels.admin_payment, exact: true });
    await pay.click();
    await expect(amount).toHaveValue("");
    await expect(pay).toBeEnabled();
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
    await staff
      .getByRole("tabpanel")
      .getByRole("button", { name: labels.admin_close_session, exact: true })
      .click();
    await expect(guest.getByRole("heading", { name: ja.kiosk_closed })).toBeVisible();
    const closed = tableStateSchema.parse(
      await (await staff.request.get(`/api/admin/stores/${storeId}/tables/${ordered.id}`)).json(),
    );
    expect(closed.id).toBe(ordered.id);
    expect(closed.status).toBe("closed");
  } finally {
    // DBとWorkerはcase専用fixtureが破棄する。後片付けのHTTPで元の失敗を上書きしない。
    const video = guest.video();
    await guestContext.close();
    if (video)
      await testInfo.attach("tablecast-order-ui", {
        path: await video.path(),
        contentType: "video/webm",
      });
  }
});
