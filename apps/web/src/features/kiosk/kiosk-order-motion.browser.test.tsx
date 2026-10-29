import { expect, it } from "vitest";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { fixtureValue } from "../../test-support/fixture-value";
import { product } from "../../test-support/tablecast-fixtures";
import { fixture, mountKiosk, orderPanel, orderWrites } from "./test-support/kiosk-fixture";

it.each(["入力変更", "クリア"])(
  "検索の%sでもカテゴリの位置を保ち、応答待ちは直前の結果とspinnerを残す",
  async (action) => {
    fixture.current.uiSection = "menu";
    await page.viewport(1180, 820);
    await mountKiosk();
    await expect
      .element(page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }))
      .toBeVisible();
    const categories = document.querySelector('[data-ui="menu-categories"]');
    if (!(categories instanceof HTMLElement)) throw new Error("カテゴリが必要です");
    const before = categories.getBoundingClientRect();
    const firstCard = document.querySelector('[data-theme-part="product-card"]');
    if (!firstCard) throw new Error("初期の商品カードが必要です");
    const cardTop = firstCard.getBoundingClientRect().top;
    expect(parseFloat(getComputedStyle(categories).paddingTop)).toBeGreaterThanOrEqual(6);
    expect(parseFloat(getComputedStyle(categories).paddingBottom)).toBeGreaterThanOrEqual(6);
    await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
    expect(document.querySelector('[data-ui="menu-categories"]')).toBe(categories);
    expect(categories.getBoundingClientRect().top).toBeCloseTo(before.top, 1);
    expect(firstCard.getBoundingClientRect().top).toBeCloseTo(cardTop, 1);
    const originalCount = document.querySelectorAll('[data-theme-part="product-card"]').length;
    const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
    await input.fill(product.text.ja.displayName);
    await expect.poll(() => fixture.current.menuSearch?.total).toBe(1);
    const result = page.getByRole("button", { name: new RegExp(product.text.ja.displayName) });
    await expect.element(result).toBeVisible();
    const release = Promise.withResolvers<void>();
    const reached = Promise.withResolvers<void>();
    fixture.beforeRequest = async (request) => {
      if (request.method === "PATCH" && new URL(request.url).pathname.endsWith("/ui")) {
        reached.resolve();
        await release.promise;
      }
    };
    try {
      if (action === "クリア")
        await page.getByRole("button", { name: ja.kiosk_menu_search_clear }).click();
      else await input.fill("未登録の検索商品");
      await reached.promise;
      await expect.element(result).toBeVisible();
      await expect
        .element(page.getByRole("status").filter({ hasText: ja.kiosk_menu_search_updating }))
        .toBeVisible();
      expect(fixture.client.isMutating()).toBeGreaterThan(0);
      expect(categories.getBoundingClientRect().top).toBeCloseTo(before.top, 1);
      release.resolve();
      await expect
        .poll(() => document.querySelectorAll('[data-theme-part="product-card"]').length)
        .toBe(action === "クリア" ? originalCount : 0);
      await page.getByRole("button", { name: ja.common_back, exact: true }).click();
      await expect.element(input).not.toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }))
        .toHaveFocus();
      expect(categories.getBoundingClientRect().top).toBeCloseTo(before.top, 1);
    } finally {
      fixture.beforeRequest = undefined;
      release.resolve();
    }
  },
);

it("食品情報の初回待機を示し、badgeと選択肢を同時表示して再取得中の位置と自然高を保つ", async () => {
  fixture.current.uiSection = "menu";
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();
  let calls = 0;
  fixture.beforeRequest = async (request) => {
    if (!new URL(request.url).pathname.endsWith("/food-information")) return;
    calls += 1;
    if (calls === 1) await first.promise;
    else {
      reached.resolve();
      await second.promise;
    }
  };
  await page.viewport(1180, 820);
  await mountKiosk();
  try {
    await page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }).click();
    const dialog = page.getByRole("dialog", { name: product.text.ja.displayName, exact: true });
    await expect.element(dialog.getByRole("status")).toHaveTextContent(ja.food_updating);
    expect(dialog.element().querySelector('[data-ui="customisation-groups"]')).toBeNull();
    first.resolve();
    const choice = dialog.getByRole("radio", { name: "90 mL", exact: true });
    await expect.element(choice).toBeVisible();
    const detail = dialog.element().querySelector('[data-ui="product-detail"]');
    const groups = dialog.element().querySelector('[data-ui="customisation-groups"]');
    if (!(detail instanceof HTMLElement) || !groups) throw new Error("詳細と選択肢が必要です");
    await expect.poll(() => getComputedStyle(detail).transform).toBe("none");
    const pane = orderPanel();
    if (!pane) throw new Error("注文ペインが必要です");
    await expect.poll(() => getComputedStyle(dialog.element()).transform).toBe("none");
    const bounds = dialog.element().getBoundingClientRect();
    const paneBounds = pane.getBoundingClientRect();
    expect(bounds.height).toBeLessThan(paneBounds.height - 48);
    expect(bounds.left - paneBounds.left).toBeCloseTo(24, 0);
    expect(paneBounds.right - bounds.right).toBeCloseTo(24, 0);
    const before = groups.getBoundingClientRect();
    await choice.click();
    await reached.promise;
    await expect
      .element(dialog.getByRole("region", { name: ja.food_title, exact: true }))
      .toHaveAttribute("aria-busy", "true");
    expect(groups.getBoundingClientRect().top).toBeCloseTo(before.top, 1);
    expect(groups.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    expect(dialog.element().getBoundingClientRect().height).toBeCloseTo(bounds.height, 1);
    second.resolve();
    await expect
      .element(dialog.getByRole("region", { name: ja.food_title, exact: true }))
      .toHaveAttribute("aria-busy", "false");
  } finally {
    first.resolve();
    second.resolve();
  }
});

it("注文失敗の対象と件数をtoastへ示し、進捗の一時停止と同じ承認内容での再送・自動消去を保つ", async () => {
  const line = fixtureValue(fixture.current.cart.lines[0]);
  fixture.current.cart.lines = [{ ...line, quantity: 3, total: line.unitPrice * 3 }];
  fixture.current.cart.total = line.unitPrice * 3;
  const attempts: unknown[] = [];
  fixture.beforeRequest = async (request) => {
    if (!new URL(request.url).pathname.endsWith("/orders") || request.method !== "POST") return;
    attempts.push(await request.clone().json());
    if (attempts.length === 1) throw new TypeError("注文送信の接続失敗");
  };
  await page.viewport(1180, 820);
  await mountKiosk();
  await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
  await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
  const confirmation = page.getByRole("group", { name: ja.kiosk_cart, exact: true });
  await confirmation.getByRole("button", { name: ja.kiosk_confirm, exact: true }).click();
  const failure = page.getByRole("dialog", {
    name: ja.kiosk_order_failed_items.replace("{count}", "3"),
    exact: true,
  });
  await expect.element(failure).toBeVisible();
  expect(failure.element().getAttribute("data-type")).toBe("error");
  const progress = failure.element().querySelector('[data-ui="toast-progress"]');
  if (!progress) throw new Error("残時間のprogressが必要です");
  const animation = fixtureValue(progress.getAnimations()[0]);
  await expect.poll(() => Number(animation.currentTime)).toBeGreaterThan(0);
  await failure.hover();
  await expect.poll(() => animation.playState).toBe("paused");
  await confirmation.getByRole("button", { name: ja.kiosk_confirm, exact: true }).hover();
  await expect.poll(() => animation.playState).toBe("running");
  await expect.element(confirmation).toBeVisible();
  expect(orderWrites).toHaveLength(0);
  await confirmation.getByRole("button", { name: ja.kiosk_confirm, exact: true }).click();
  const success = page.getByRole("dialog", {
    name: ja.kiosk_ordered_items.replace("{count}", "3"),
    exact: true,
  });
  await expect.element(success).toBeVisible();
  expect(success.element().getAttribute("data-type")).toBe("success");
  const title = success.element().querySelector('[data-slot="toast-title"], h2');
  const text = success
    .getByText(ja.kiosk_ordered_items.replace("{count}", "3"), { exact: true })
    .element();
  expect(parseInt(getComputedStyle(title ?? text).fontWeight, 10)).toBeGreaterThanOrEqual(700);
  expect(success.element().querySelector("svg")).not.toBeNull();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(orderWrites).toHaveLength(1);
  expect(orderWrites[0]?.approved).toBe(true);
  // キーボードでtoastへ移動しない限り、Base UIの4秒の期限で消える。
  await expect.element(success).not.toBeInTheDocument();
});
