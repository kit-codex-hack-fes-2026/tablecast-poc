import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { money } from "../../i18n/format";
import { fixtureValue } from "../../test-support/fixture-value";
import { fixture, mountKiosk, orderPanel } from "./test-support/kiosk-fixture";

it.each(["ja", "en"] as const)(
  "%sで下部タブの金額・画像とペイン内詳細・成功通知を確認できる",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    fixture.current.locale = locale;
    fixture.current.uiSection = "menu";
    fixture.current.staffCalled = false;
    const pictured = structuredClone(product);
    pictured.imageKey = "tablecast/images/tablecast-product.webp";
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
      expect(price.getBoundingClientRect().height).toBeLessThan(20);
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
    await page.getByRole("button", { name: labels.kiosk_call_staff, exact: true }).click();
    await expect
      .element(page.getByRole("dialog", { name: labels.kiosk_called_staff, exact: true }))
      .toBeVisible();
  },
);

it("カゴの商品画像は3枚まで重ねて表示する", async () => {
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
  const cart = page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) });
  await expect.element(cart).toBeVisible();
  await expect
    .poll(() => cart.element().querySelectorAll('[data-ui="cart-preview"] > span').length)
    .toBe(3);
  const frames = cart.element().querySelectorAll('[data-ui="cart-preview"] > span');
  expect(frames).toHaveLength(3);
  for (let index = 1; index < frames.length; index++) {
    expect(fixtureValue(frames[index]).getBoundingClientRect().left).toBeLessThan(
      fixtureValue(frames[index - 1]).getBoundingClientRect().right,
    );
  }
});
