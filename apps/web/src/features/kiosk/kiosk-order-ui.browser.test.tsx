import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { money } from "../../i18n/format";
import { fixtureValue } from "../../test-support/fixture-value";
import { cartWrites, fixture, mountKiosk, orderPanel } from "./test-support/kiosk-fixture";

it.each(["ja", "en"] as const)(
  "%sで下部タブの金額・画像とペイン内詳細・成功通知を確認できる",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    fixture.current.locale = locale;
    fixture.current.uiSection = "menu";
    fixture.current.staffCalled = false;
    const pictured = structuredClone(product);
    pictured.imageKey = "tablecast/images/tablecast-product.webp";
    pictured.imageKind = "illustration";
    const option = fixtureValue(pictured.modifiers[0]).options.find(
      (item) => item.id === "tablecast-large-glass",
    );
    if (!option) throw new Error("画像付き選択肢が必要です");
    option.imageKey = "tablecast/images/tablecast-option.webp";
    fixture.catalogResponse = Response.json({
      ...catalog,
      configuration: { ...catalog.configuration, products: [pictured] },
    });
    await page.viewport(1024, 768);
    await mountKiosk();
    const tabs = page.getByRole("tablist");
    const cart = page.getByRole("tab", { name: new RegExp(`^${labels.kiosk_cart}`) });
    const orders = page.getByRole("tab", { name: new RegExp(`^${labels.kiosk_orders_bill}`) });
    await expect.element(cart).toBeVisible();
    await expect
      .element(
        page.getByRole("tabpanel").getByRole("heading", { name: labels.kiosk_menu, exact: true }),
      )
      .toBeVisible();
    await expect
      .element(page.getByRole("tabpanel").getByText(labels.kiosk_cart_total, { exact: true }))
      .toBeVisible();
    const pane = orderPanel();
    if (!pane) throw new Error("注文ペインがありません");
    await expect
      .element(cart.getByText(money(fixture.current.cart.total, locale), { exact: true }))
      .toBeVisible();
    await expect
      .element(orders.getByText(money(fixture.current.bill.orderedTotal, locale), { exact: true }))
      .toBeVisible();
    expect(tabs.element().getBoundingClientRect().bottom).toBeCloseTo(
      pane.getBoundingClientRect().bottom,
      0,
    );
    const header = document.querySelector("header");
    expect(header?.getBoundingClientRect().height).toBe(64);
    expect(page.getByRole("tab").elements()).toHaveLength(3);
    const brand = header?.querySelector('img[alt="TableCast"]');
    const divider = header?.querySelector('[data-ui="header-divider"]');
    const banner = header?.querySelector('[data-ui="store-logo-banner"]');
    if (!brand || !divider || !banner) throw new Error("ロゴ・区切り線・店舗バナーが必要です");
    expect(brand.getBoundingClientRect().right).toBeLessThan(divider.getBoundingClientRect().left);
    expect(divider.getBoundingClientRect().right).toBeLessThan(banner.getBoundingClientRect().left);
    expect(document.querySelector("footer[data-theme-part=checkout]")).toBeNull();
    const callout = page.getByRole("group", { name: labels.kiosk_cart, exact: true });
    await expect
      .element(callout.getByRole("button", { name: labels.kiosk_review, exact: true }))
      .toBeVisible();
    expect(callout.element().getBoundingClientRect().bottom).toBeLessThan(
      tabs.element().getBoundingClientRect().top,
    );
    for (const price of document.querySelectorAll('[data-ui="tab-price"]')) {
      expect(getComputedStyle(price).whiteSpace).toBe("nowrap");
      expect(parseFloat(getComputedStyle(price).fontSize)).toBeGreaterThanOrEqual(14);
      expect(price.getBoundingClientRect().height).toBeLessThanOrEqual(24);
    }
    const choose = page
      .getByRole("button")
      .filter({ has: page.getByText(pictured.text[locale].displayName, { exact: true }) });
    await choose.click();
    const dialog = page.getByRole("dialog", {
      name: pictured.text[locale].displayName,
      exact: true,
    });
    await expect.element(dialog).toBeVisible();
    expect(pane.contains(dialog.element())).toBe(true);
    const bounds = dialog.element().getBoundingClientRect();
    expect(bounds.left).toBeGreaterThan(pane.getBoundingClientRect().left);
    expect(bounds.right).toBeLessThan(pane.getBoundingClientRect().right);
    const image = dialog.element().querySelector("img");
    expect(image?.getBoundingClientRect().width).toBeLessThanOrEqual(160);
    await expect
      .element(dialog.getByRole("button", { name: labels.kiosk_add, exact: true }))
      .toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(choose).toHaveFocus();
    await choose.click();
    await dialog.getByRole("radio", { name: "90 mL", exact: true }).click();
    await dialog.getByRole("button", { name: labels.kiosk_add, exact: true }).click();
    await expect.element(cart).toHaveAttribute("aria-selected", "true");
    await expect
      .element(
        page.getByRole("tabpanel").getByRole("heading", { name: labels.kiosk_cart, exact: true }),
      )
      .toBeVisible();
    await expect
      .element(
        page.getByRole("tabpanel").getByRole("button", { name: labels.kiosk_review, exact: true }),
      )
      .toBeEnabled();
    expect(document.querySelector('[data-ui="cart-callout"]')).toBeNull();
    await expect.element(page.getByText(labels.kiosk_cart_added, { exact: true })).toBeVisible();
    await page
      .getByRole("dialog", { name: labels.kiosk_cart_added, exact: true })
      .getByRole("button", { name: labels.common_close, exact: true })
      .click();
    await expect
      .element(page.getByRole("dialog", { name: labels.kiosk_cart_added, exact: true }))
      .not.toBeInTheDocument();
    expect(cart.element().querySelectorAll("img")).toHaveLength(1);
    expect(
      pane.querySelector('[data-ui="cart-lines"] img[src*="tablecast-option"]'),
    ).not.toBeNull();
    const picture = pane.querySelector('[data-ui="cart-product-image"]');
    const card = picture?.closest("li");
    if (!picture || !card) throw new Error("商品画像付きのカードが必要です");
    expect(picture.getBoundingClientRect().height).toBeCloseTo(card.clientHeight, 1);
    const cardImage = picture.querySelector("img");
    if (!cardImage) throw new Error("カードの商品画像が必要です");
    expect(getComputedStyle(cardImage).objectFit).toBe("contain");
    const cardStyle = getComputedStyle(card);
    expect(parseFloat(cardStyle.borderTopWidth)).toBeGreaterThanOrEqual(1);
    const customisations = page.getByRole("region", {
      name: labels.kiosk_customisations,
      exact: true,
    });
    await expect
      .element(customisations.getByRole("button", { name: labels.kiosk_edit, exact: true }))
      .toBeVisible();
    expect(customisations.element().textContent).toContain(
      `${fixtureValue(pictured.modifiers[0]).text[locale].displayName}:`,
    );
    const illustration = picture.querySelector('[data-ui="illustration-label"]');
    expect(illustration).not.toBeNull();
    expect(
      getComputedStyle(pane.querySelector('[data-ui="line-actions"]') ?? card).justifyContent,
    ).toBe("flex-end");
    await page.getByRole("button", { name: labels.kiosk_call_staff, exact: true }).click();
    await expect
      .element(page.getByRole("dialog", { name: labels.kiosk_called_staff, exact: true }))
      .toBeVisible();
  },
);

it("カゴの商品画像は3枚まで重ねて表示する", async () => {
  fixture.current.locale = "en";
  fixture.current.uiSection = "menu";
  const products = Array.from({ length: 4 }, (_, index) => ({
    ...product,
    id: `tablecast-stack-${index}`,
    imageKey: `tablecast/images/tablecast-stack-${index}.webp`,
  }));
  const line = fixtureValue(fixture.current.cart.lines[0]);
  fixture.current.cart.lines = products.map((item, index) => ({
    ...line,
    id: `tablecast-line-${index}`,
    productId: item.id,
  }));
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products },
  });
  await page.viewport(1024, 768);
  await mountKiosk();
  const cart = page.getByRole("tab", { name: new RegExp(`^${en.kiosk_cart}`) });
  await expect.element(cart).toBeVisible();
  await expect
    .poll(() => cart.element().querySelectorAll('[data-ui="cart-preview"] > span').length)
    .toBe(3);
  const frames = cart.element().querySelectorAll('[data-ui="cart-preview"] > span');
  expect(frames).toHaveLength(3);
  expect(cart.element().querySelector('[data-ui="cart-icon"]')).not.toBeNull();
  for (const frame of frames) {
    expect(frame.getBoundingClientRect().width).toBe(32);
    expect(parseFloat(getComputedStyle(frame).borderRadius)).toBeGreaterThan(0);
    expect(parseFloat(getComputedStyle(frame).borderRadius)).toBeLessThan(16);
    expect(getComputedStyle(frame).borderTopWidth).toBe("0px");
  }
  for (let index = 1; index < frames.length; index++) {
    expect(fixtureValue(frames[index]).getBoundingClientRect().left).toBeLessThan(
      fixtureValue(frames[index - 1]).getBoundingClientRect().right,
    );
  }
  for (const [width, height] of [
    [1024, 768],
    [402, 874],
  ] as const) {
    await page.viewport(width, height);
    for (const price of document.querySelectorAll('[data-ui="tab-price"]')) {
      await expect.poll(() => price.querySelector("[aria-label]")?.textContent).toContain("US$");
      expect(getComputedStyle(price).whiteSpace).toBe("nowrap");
      expect(price.scrollWidth).toBeLessThanOrEqual(cart.element().clientWidth);
      expect(getComputedStyle(price).overflowX).toBe("visible");
      expect(parseFloat(getComputedStyle(price).fontSize)).toBeGreaterThanOrEqual(14);
    }
    expect(
      cart.element().querySelector('[data-ui="cart-icon"]')?.getBoundingClientRect().width,
    ).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: en.kiosk_review, exact: true }).click();
  await page.getByRole("button", { name: en.kiosk_confirm, exact: true }).click();
  const orders = page.getByRole("tab", { name: new RegExp(`^${en.kiosk_orders_bill}`) });
  await expect
    .poll(() => orders.element().querySelectorAll('[data-ui="orders-preview"] > span').length)
    .toBe(3);
  expect(cart.element().querySelector('[data-ui="cart-preview"]')).toBeNull();
  expect(cart.element().querySelector('[data-ui="cart-icon"]')).not.toBeNull();
  expect(cart.element().querySelector('[data-ui="cart-count"]')?.textContent).toBe("0");
  expect(orders.element().querySelector('[data-ui="orders-count"]')?.textContent).toBe("4");
  await orders.click();
  await expect
    .element(
      page.getByRole("tabpanel").getByRole("heading", { name: en.kiosk_orders_bill, exact: true }),
    )
    .toBeVisible();
  const receipt = document.querySelector('[data-ui="order-card"]');
  const bill = document.querySelector('[data-ui="bill-summary"]');
  if (!receipt || !bill) throw new Error("注文明細と会計内訳が必要です");
  expect(receipt.getBoundingClientRect().top).toBeLessThan(bill.getBoundingClientRect().top);
});

it("数量はラベル付き入力で編集し、入力確定時だけAPIへ送る", async () => {
  fixture.current.uiSection = "cart";
  const line = fixtureValue(fixture.current.cart.lines[0]);
  fixture.savedCart = {
    ...fixture.current.cart,
    version: 2,
    total: 2250,
    lines: [{ ...line, quantity: 3, total: 2250 }],
  };
  await mountKiosk();
  const input = page.getByRole("textbox", {
    name: `${line.name.ja}: ${ja.common_quantity}`,
    exact: true,
  });
  await expect.element(input).toBeVisible();
  expect(page.getByText(ja.common_quantity, { exact: true }).elements()).toHaveLength(1);
  await input.fill("3");
  expect(cartWrites).toHaveLength(0);
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => cartWrites.length).toBe(1);
  expect(cartWrites[0]?.lines[0]?.quantity).toBe(3);
  await expect.element(input).toHaveValue("3");
});
