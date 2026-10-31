import { expect, it } from "vitest";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { fixtureValue } from "../../test-support/fixture-value";
import { cartWrites, fixture, mountKiosk, requests } from "./test-support/kiosk-fixture";

it("1.5秒の応答待ちでも数量・件数は100ms以内に変わり、連打を最新の版で直列送信する", async () => {
  const original = structuredClone(fixture.current.cart);
  const line = fixtureValue(original.lines[0]);
  const releases: (() => void)[] = [];
  fixture.beforeRequest = async (request) => {
    if (request.method === "PUT") await new Promise<void>((resolve) => releases.push(resolve));
  };
  await mountKiosk();
  const increase = page.getByRole("button", {
    name: `${line.name.ja}: ${ja.common_increase}`,
    exact: true,
  });
  const cart = page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) });
  await expect.element(increase).toBeEnabled();
  const count = cart.element().querySelector('[data-ui="cart-count"]');
  if (!count) throw new Error("件数表示が必要です");
  let clickedAt = 0;
  increase.element().addEventListener(
    "click",
    () => {
      clickedAt = performance.now();
    },
    { once: true },
  );
  const response = new Promise<number>((resolve) => {
    const observer = new MutationObserver(() => {
      if (count.textContent === "2") {
        observer.disconnect();
        resolve(performance.now() - clickedAt);
      }
    });
    observer.observe(count, { childList: true, subtree: true, characterData: true });
  });
  try {
    await increase.click();
    const elapsed = await response;
    console.info(`カート件数のDOM反映: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(100);
    await increase.click();
    await increase.click();
    await expect
      .element(
        page.getByRole("textbox", { name: `${line.name.ja}: ${ja.common_quantity}`, exact: true }),
      )
      .toHaveValue("4");
    expect(count.textContent).toBe("4");
    await cart.click();
    await expect
      .element(page.getByRole("button", { name: ja.kiosk_review, exact: true }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("status").filter({ hasText: ja.kiosk_cart_syncing }).first())
      .toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(cartWrites).toHaveLength(0);
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(1);
    for (let index = 0; index < 3; index++) {
      fixture.savedCart = {
        ...original,
        version: original.version + index + 1,
        lines: [{ ...line, quantity: index + 2 }],
      };
      await expect.poll(() => releases.length).toBe(index + 1);
      fixtureValue(releases[index])();
      await expect.poll(() => cartWrites.length).toBe(index + 1);
    }
    await expect
      .element(page.getByRole("button", { name: ja.kiosk_review, exact: true }))
      .toBeEnabled();
    expect(cartWrites.map((input) => [input.expectedVersion, input.lines[0]?.quantity])).toEqual([
      [original.version, 2],
      [original.version + 1, 3],
      [original.version + 2, 4],
    ]);
  } finally {
    fixture.beforeRequest = undefined;
    for (const release of releases) release();
  }
});
