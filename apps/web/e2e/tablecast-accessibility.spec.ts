import { z } from "zod";
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../../../.local/demo.json", import.meta.url), "utf8")));

// 認証入力を含むため、この読取り専用シナリオでは通信traceを保存しない。
test.use({ trace: "off" });

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let count = 0; count < 40; count += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
}

async function signInWithKeyboard(page: Page) {
  await tabTo(page, page.getByLabel("メールアドレス"));
  await page.keyboard.insertText(credentials.email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("パスワード", { exact: true })).toBeFocused();
  await page.keyboard.insertText(credentials.password);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/live$/);
  await expect(page.getByRole("heading", { name: "フロアの様子", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
}

async function enlargeText(scope: Locator) {
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

async function expectReadableControl(control: Locator) {
  await control.scrollIntoViewIfNeeded();
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

test("動きを抑える設定でキーボードだけでログイン・言語切替・端末承認画面の開閉ができる", async ({
  page,
}, testInfo) => {
  // 前提: 実APIへ接続し、店舗の状態を変更せず管理画面を閲覧する。
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await signInWithKeyboard(page);

  // 操作: TabとEnterだけで英語へ切り替え、モーダル内を巡回する。
  await tabTo(page, page.getByRole("button", { name: "English", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Live floor", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tablecast-admin-normal-en.png") });
  const trigger = page.getByRole("button", { name: "Approve device", exact: true });
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Approve device", exact: true });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("Code shown on the device")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("combobox", { name: "Assigned table" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Approve", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  // 結果: 背景へfocusが抜けず、長く動くanimationがなく、閉じると元の操作へ戻る。
  expect(
    await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => {
          const timing = animation.effect?.getComputedTiming();
          return (
            animation.playState === "running" &&
            typeof timing?.duration === "number" &&
            timing.duration > 1
          );
        }).length,
    ),
  ).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("tablecast-keyboard-reduced-motion.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await tabTo(page, page.getByRole("button", { name: "Publish settings", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Settings drafts", exact: true })).toBeVisible();
  await tabTo(page, page.getByRole("button", { name: "Live floor", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table")).toBeVisible();
});

test("文字を200%に拡大してもログインと管理画面の主要操作が欠けずに利用できる", async ({
  page,
}, testInfo) => {
  // 前提: 1024×768の実画面で、画像やviewportではなく文字を拡大する。
  await page.goto("/login");
  const title = page.getByRole("heading", { name: "TableCast スタッフログイン" });
  const originalSize = await title.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await enlargeText(page.getByRole("main"));
  expect(
    await title.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBe(originalSize * 2);
  for (const name of ["日本語", "English", "ログイン"])
    await expectReadableControl(page.getByRole("button", { name, exact: true }));
  await page.screenshot({ path: testInfo.outputPath("tablecast-login-text-200.png") });
  await signInWithKeyboard(page);

  // 操作: 管理画面と端末承認画面でも同じ文字拡大を適用する。承認は送信しない。
  await enlargeText(page.locator(".admin-shell"));
  const trigger = page.getByRole("button", { name: "端末を承認", exact: true });
  for (const name of ["フロアの様子", "設定の公開", "端末を承認", "日本語", "English"])
    await expectReadableControl(page.getByRole("button", { name, exact: true }));
  await page.screenshot({ path: testInfo.outputPath("tablecast-admin-text-200.png") });
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "端末を承認", exact: true });
  await expect(dialog).toBeVisible();
  await enlargeText(dialog);
  await expectReadableControl(dialog.getByRole("button", { name: "承認する", exact: true }));
  await expectReadableControl(dialog.getByRole("button", { name: "閉じる", exact: true }));
  await tabTo(page, dialog.getByLabel("端末に表示されたコード"));
  await tabTo(page, dialog.getByRole("combobox", { name: "割り当てる卓" }));
  await page.screenshot({ path: testInfo.outputPath("tablecast-dialog-text-200.png") });

  // 結果: 送信せず閉じてもキーボードの起点が維持される。
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  // 英語の長いラベルでも、同じ拡大状態で主要操作を読めることを確認する。
  await tabTo(page, page.getByRole("button", { name: "English", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Live floor", exact: true })).toBeVisible();
  for (const name of ["Live floor", "Publish settings", "Approve device", "日本語", "English"])
    await expectReadableControl(page.getByRole("button", { name, exact: true }));
  await page.screenshot({ path: testInfo.outputPath("tablecast-admin-text-200-en.png") });
});
