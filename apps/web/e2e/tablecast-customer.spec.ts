import { expect } from "@playwright/test";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

test.use({ viewport: { width: 390, height: 844 }, trace: "off" });

test("会員証の初回同意と設定変更をスマホで行い、再表示でも保持する", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.goto("/member/tablecast-komorebi");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  const response = await page.goto("/member/tablecast-komorebi");
  expect(response?.headers()["cache-control"]).toBe("private, no-store");
  await expect(page.getByRole("heading", { name: ja.customer_consent_title })).toBeVisible();
  await expect(page.getByRole("button", { name: ja.customer_enrol, exact: true })).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-customer-consent-ja.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: ja.customer_enrol, exact: true }).click();
  await expect(page.getByRole("heading", { name: ja.customer_preferences })).toBeVisible();
  await page.getByRole("checkbox", { name: ja.customer_save_memories, exact: true }).uncheck();
  const saved = page.waitForResponse(
    (result) => result.url().endsWith("/preferences") && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: ja.customer_save_preferences }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: ja.customer_save_memories, exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole("button", { name: ja.customer_enrol, exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-customer-card-ja.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { name: en.customer_preferences })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-customer-card-en.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: en.customer_title, exact: true }).click();
  await expect(page.getByRole("link", { name: /京料理こもれび/ })).toBeVisible();
});
