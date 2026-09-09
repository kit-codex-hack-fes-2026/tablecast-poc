import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";
import { enlargeText, expectReadableControl, tabTo } from "./tablecast-accessibility";

// 認証入力を含むため通信traceは保存しない。
test.use({ trace: "off" });
async function signInWithKeyboard(page: Page) {
  await tabTo(page, page.getByLabel(ja.auth_email));
  await page.keyboard.insertText(credentials.email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(ja.auth_password, { exact: true })).toBeFocused();
  await page.keyboard.insertText(credentials.password);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: ja.auth_sign_in, exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/stores\/[^/]+\/floor$/);
  await expect(page.getByRole("heading", { name: ja.admin_live, exact: true })).toBeVisible();
}

test("動きを抑える設定でキーボードだけでログイン・言語切替・端末登録ページへの移動ができる", async ({
  page,
}, testInfo) => {
  // Given: 管理者が動きを抑える設定でログインする。
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await signInWithKeyboard(page);
  // When: キーボードで言語を切り替え、端末の個別登録ページへ移動する。
  await tabTo(page, page.getByRole("button", { name: "English", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: en.admin_live, exact: true })).toBeVisible();
  await tabTo(page, page.getByRole("link", { name: en.device_title, exact: true }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("link", { name: en.admin_pair, exact: true }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/devices\/new(?:\?|$)/);
  await tabTo(page, page.getByLabel(en.admin_pair_code));
  await page.keyboard.insertText("ABCD1234");
  // Then: URLだけでコードと同じページを再現でき、持続するアニメーションがない。
  await expect(page).toHaveURL(/user_code=ABCD1234/);
  await page.reload();
  await expect(page.getByLabel(en.admin_pair_code)).toHaveValue("ABCD1234");
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await tabTo(page, page.getByRole("link", { name: en.device_title, exact: true }).last());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/devices$/);
});

test("日本語と英語を200%に拡大しても管理者のページ移動と入力を読める", async ({
  page,
}, testInfo) => {
  // Given: 画像でなく実際の文字サイズを拡大したログイン画面。
  await page.goto("/login");
  const title = page.getByRole("heading", { name: ja.auth_subtitle });
  const originalSize = await title.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await enlargeText(page.getByRole("main"));
  expect(
    await title.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBe(originalSize * 2);
  for (const name of ["日本語", "English", ja.auth_sign_in])
    await expectReadableControl(page.getByRole("button", { name, exact: true }));
  await signInWithKeyboard(page);
  // When / Then: 主要ナビゲーションと端末登録の操作が両言語で切れずに表示される。
  for (const [language, labels] of [
    ["日本語", ja],
    ["English", en],
  ] as const) {
    await page.getByRole("button", { name: language, exact: true }).click();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: labels.device_title, exact: true })
      .click();
    await page.getByRole("link", { name: labels.admin_pair, exact: true }).click();
    await expect(page.getByRole("heading", { name: labels.admin_pair, exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await enlargeText(page.getByRole("main"));
    await expectReadableControl(page.getByLabel(labels.admin_pair_code));
    await expectReadableControl(
      page.getByRole("button", { name: labels.admin_approve, exact: true }),
    );
    await tabTo(page, page.getByLabel(labels.admin_pair_code));
    await expect(page.getByRole("table")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`tablecast-device-text-200-${language}.png`),
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
