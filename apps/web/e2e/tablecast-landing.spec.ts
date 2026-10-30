import { expect } from "@playwright/test";
import ja from "../messages/ja.json" with { type: "json" };
import { test } from "./support/test";

// 公開入口のSSRと認証先への転送を実アプリで確認する
test.use({ trace: "off", serviceWorkers: "block" });

test("未接続LPの3つの入口と認証転送をSSRし日英で表示する", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const anonymous = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const ssr = await anonymous.newPage();
    await ssr.goto("/");
    await expect(ssr.getByRole("heading", { level: 1 })).toHaveText(ja.landing_title);
    await expect(ssr).toHaveTitle(`${ja.head_landing} · TableCast`);
    await expect(ssr.locator('head meta[name="description"]')).toHaveAttribute(
      "content",
      ja.head_landing_description,
    );
    const hero = ssr.getByRole("region", { name: ja.landing_title.replace("\n", " ") });
    await expect(
      hero.getByRole("link", { name: ja.landing_app_store_action, exact: true }),
    ).toHaveAttribute("href", "/admin/live");
    await expect(
      ssr.getByRole("contentinfo").getByRole("link", { name: ja.help_title }),
    ).toHaveAttribute("href", "/help/ja");
    await expect(
      hero.getByRole("link", { name: ja.landing_app_terminal_action, exact: true }),
    ).toHaveAttribute("href", "/pair");
    await expect(
      hero.getByRole("link", { name: ja.landing_app_member_action, exact: true }),
    ).toHaveAttribute("href", "/member");
    await expect(ssr.locator("iframe")).toHaveCount(0);
    await expect(
      ssr.getByRole("banner").getByRole("link", { name: ja.auth_sign_in, exact: true }),
    ).toHaveAttribute("href", "/login");
    await ssr.getByText(ja.landing_faq_confirmation).click();
    await expect(ssr.getByText(ja.landing_faq_confirmation_answer)).toBeVisible();
    await ssr.getByRole("contentinfo").getByRole("link", { name: ja.help_title }).click();
    await expect(ssr).toHaveURL(/\/help\/ja\/?$/);
    await expect(ssr.getByRole("heading", { level: 1 })).toBeVisible();
    await ssr.goto("/");
    await ssr
      .getByRole("region", { name: ja.landing_title.replace("\n", " ") })
      .getByRole("link", { name: ja.landing_app_store_action, exact: true })
      .click();
    await expect(ssr).toHaveURL(/\/login\?/);
    expect(new URL(ssr.url()).searchParams.get("returnTo")).toBe("/admin/live");
    await ssr.goto("/");
    await ssr
      .getByRole("region", { name: ja.landing_title.replace("\n", " ") })
      .getByRole("link", { name: ja.landing_app_member_action, exact: true })
      .click();
    await expect(ssr).toHaveURL(/\/login\?/);
    expect(new URL(ssr.url()).searchParams.get("returnTo")).toMatch(/^\/member\/?$/);
    await expect(ssr.getByRole("heading", { name: ja.customer_member_login_title })).toBeVisible();
    await ssr.goto("/pair");
    await expect(ssr.getByRole("heading", { name: ja.pair_title })).toBeVisible();
    await expect(ssr.getByRole("button", { name: ja.pair_begin, exact: true })).toBeVisible();
  } finally {
    await anonymous.close();
  }
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  for (const [device, width, height] of [
    ["macbook", 1512, 982],
    ["ipad", 1180, 820],
    ["iphone", 402, 874],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      await document.fonts.ready;
      // 遅延画像も証跡へ含め、実ファイルの配信とdecodeを確認する
      for (const image of document.images) image.loading = "eager";
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    await page.screenshot({ path: testInfo.outputPath(`tablecast-landing-${device}.png`) });
  }
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.screenshot({
    path: testInfo.outputPath("tablecast-landing-full.png"),
    fullPage: true,
  });
  await page
    .getByRole("region", { name: ja.landing_title.replace("\n", " ") })
    .locator('[data-device="tablet"]')
    .screenshot({ path: testInfo.outputPath("tablecast-landing-ipad-frame.png") });
  await page
    .locator("#conversation")
    .screenshot({ path: testInfo.outputPath("tablecast-landing-stories.png") });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A menu you can talk to");
  await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
    "content",
    /Multilingual/,
  );
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Documentation", exact: true }),
  ).toHaveAttribute("href", "/help/en");
  await page.screenshot({ path: testInfo.outputPath("tablecast-landing-english.png") });
  expect(errors).toEqual([]);
});
