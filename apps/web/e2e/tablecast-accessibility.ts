import { expect, type Locator, type Page } from "@playwright/test";
import process from "node:process";

export async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  // macOSのWebKitでは、リンクを含む移動にOption+Tabを使う。
  const key =
    process.platform === "darwin" && page.context().browser()?.browserType().name() === "webkit"
      ? "Alt+Tab"
      : "Tab";
  for (let count = 0; count < 80; count += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
}

export async function enlargeText(scope: Locator) {
  // px指定を含む文字を2倍にする。実iPadの文字設定やブラウザーの全体zoomの代用とは扱わない。
  await scope.evaluate((root) => {
    const sizes = [root, ...root.querySelectorAll("*")]
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          (element.matches("input, select, textarea") ||
            [...element.childNodes].some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            )),
      )
      .map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }));
    for (const { element, size } of sizes) element.style.fontSize = `${size * 2}px`;
  });
}

export async function expectReadableControl(control: Locator) {
  await control.scrollIntoViewIfNeeded({ timeout: 15000 });
  await expect(control).toBeInViewport({ ratio: 1 });
  const overflow = await control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = text.nextNode();
    let outside = false;
    while (node) {
      if (node.textContent?.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects())
          if (
            rect.left < bounds.left - 2 ||
            rect.right > bounds.right + 2 ||
            rect.top < bounds.top - 2 ||
            rect.bottom > bounds.bottom + 2
          )
            outside = true;
      }
      node = text.nextNode();
    }
    return outside;
  });
  expect
    .soft(overflow, `${await control.innerText()}: 操作ラベルが操作領域からはみ出していない`)
    .toBe(false);
}
