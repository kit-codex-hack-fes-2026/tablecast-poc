import { expect, it } from "vitest";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { fixtureValue } from "../../test-support/fixture-value";
import { catalog, product } from "../../test-support/tablecast-fixtures";
import { cartWrites, fixture, mountKiosk, notify, requests } from "./test-support/kiosk-fixture";

it("追加は応答前に詳細を閉じて画像と件数を反映し、カテゴリ・タブ・スクロールを保つ", async () => {
  fixture.current.uiSection = "menu";
  fixture.current.cart.lines = [];
  fixture.current.cart.total = 0;
  const pictured = {
    ...product,
    imageKey: "tablecast/images/tablecast-optimistic.webp",
    modifiers: [],
  };
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products: [pictured] },
  });
  let release: (() => void) | undefined;
  fixture.beforeRequest = async (request) => {
    if (request.method === "PUT")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
  };
  await mountKiosk();
  const choose = page
    .getByRole("button")
    .filter({ has: page.getByText(product.text.ja.displayName, { exact: true }) });
  await choose.click();
  const detail = page.getByRole("dialog", { name: product.text.ja.displayName, exact: true });
  await expect.element(detail).toBeVisible();
  const scroll = document.querySelector('[role="tabpanel"]');
  const beforeScroll = scroll?.scrollTop;
  const uiWrites = requests.filter((request) =>
    new URL(request.url).pathname.endsWith("/ui"),
  ).length;
  try {
    await detail.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
    await expect.element(detail).not.toBeInTheDocument();
    const cart = page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) });
    await expect
      .poll(() => cart.element().querySelector('[data-ui="cart-count"]')?.textContent)
      .toBe("1");
    expect(cart.element().querySelectorAll('[data-ui="cart-preview"] img')).toHaveLength(1);
    await expect
      .element(page.getByRole("tab", { name: ja.kiosk_menu, exact: true }))
      .toHaveAttribute("aria-selected", "true");
    expect(scroll?.scrollTop).toBe(beforeScroll);
    expect(cartWrites).toHaveLength(0);
    expect(
      requests.filter((request) => new URL(request.url).pathname.endsWith("/ui")),
    ).toHaveLength(uiWrites);
    await expect.poll(() => Boolean(release)).toBe(true);
  } finally {
    fixture.beforeRequest = undefined;
    release?.();
    await expect.poll(() => cartWrites.length).toBe(1);
  }
});

it("409と他端末の更新が重なっても後続の削除と新しく開いた詳細を巻き戻さない", async () => {
  const first = fixtureValue(fixture.current.cart.lines[0]);
  const second = {
    ...product,
    id: "tablecast-next-product",
    modifiers: [],
    text: {
      ja: { ...product.text.ja, displayName: "次の商品" },
      en: { ...product.text.en, displayName: "Next item" },
    },
  };
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products: [product, second] },
  });
  let release: (() => void) | undefined;
  let putCount = 0;
  fixture.beforeRequest = async (request) => {
    if (request.method === "PUT") {
      putCount++;
      if (putCount === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      fixture.cartFailure = putCount === 1 ? 409 : 0;
    }
  };
  await mountKiosk();
  try {
    await page
      .getByRole("button", { name: `${first.name.ja}: ${ja.common_increase}`, exact: true })
      .click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.getByRole("button", { name: ja.common_remove, exact: true }).click();
    await page.getByRole("tab", { name: ja.kiosk_menu, exact: true }).click();
    await page
      .getByRole("button")
      .filter({ has: page.getByText("次の商品", { exact: true }) })
      .click();
    const detail = page.getByRole("dialog", { name: "次の商品", exact: true });
    await expect.element(detail).toBeVisible();
    // 外部端末の確定値をイベントで取得し、最初の操作だけを競合にする。
    fixture.current = {
      ...fixture.current,
      cart: { ...fixture.current.cart, version: 8, lines: [{ ...first, quantity: 7 }] },
    };
    fixture.savedCart = { ...fixture.current.cart, version: 9, lines: [], total: 0 };
    notify("cart.updated");
    release?.();
    await expect.poll(() => cartWrites.length).toBe(2);
    expect(cartWrites[1]).toMatchObject({ expectedVersion: 8, lines: [] });
    await expect.element(detail).toBeVisible();
    await expect.poll(() => fixture.current.cart.lines.length).toBe(0);
    await expect.poll(() => fixture.client.isMutating()).toBe(0);
    expect(document.querySelector('[data-ui="cart-count"]')?.textContent).toBe("0");
  } finally {
    fixture.beforeRequest = undefined;
    fixture.cartFailure = 0;
    release?.();
  }
});
