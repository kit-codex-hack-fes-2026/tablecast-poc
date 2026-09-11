import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { test } from "./support/test";

// HTTP境界を差し替える試験ではSWによる通信の迂回を止める。
test.use({ serviceWorkers: "block" });

for (const [locale, messages] of [
  ["ja", ja],
  ["en", en],
] as const) {
  test(`${locale}の登録フォームが項目エラーを示し、API失敗後も入力を保持して再送できる`, async ({
    page,
    browserName,
  }) => {
    // Given: 実アプリの登録画面と、失敗を制御するAuthのHTTP境界。
    await page.goto("/register");
    await page
      .getByRole("button", { name: locale === "ja" ? "日本語" : "English", exact: true })
      .click();
    let requests = 0;
    await page.route("**/api/auth/sign-up/email", async (route) => {
      requests++;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "SERVICE_UNAVAILABLE", message: "Unavailable" }),
      });
    });
    const button = page.getByRole("button", { name: messages.auth_register, exact: true });
    // When: 未入力で送信し、エラーを修正して再送する。
    await button.click();
    const email = page.getByRole("textbox", { name: messages.auth_email, exact: true });
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription(messages.form_email);
    expect(requests).toBe(0);
    const directory = resolve(import.meta.dirname, "../../../.local/tablecast-quality-evidence");
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: resolve(directory, `web-form-${locale}-${browserName}.png`),
      fullPage: true,
    });
    await page
      .getByRole("textbox", { name: messages.account_name, exact: true })
      .fill("TableCast Staff");
    await email.fill("form-test@example.test");
    await page
      .getByLabel(messages.auth_password, { exact: true })
      .fill("tablecast-form-test-password");
    await button.click();
    // Then: 通信失敗を表示し、入力を維持して同じ内容を再送できる。
    await expect(page.getByRole("alert")).toHaveText(messages.account_failed);
    await expect(email).toHaveValue("form-test@example.test");
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(() => requests).toBe(2);
    await expect(
      page.getByRole("textbox", { name: messages.account_name, exact: true }),
    ).toHaveValue("TableCast Staff");
  });
}
