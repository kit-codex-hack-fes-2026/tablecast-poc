import { expect } from "@playwright/test";
import { test } from "./support/test";
import { signInStaff } from "./support/session";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });

for (const locale of ["ja", "en"] as const) {
  test(`${locale}の店舗会員ホームは同意後に特典を表示し、詳細から店舗へ戻れる`, async ({
    page,
    baseURL,
  }) => {
    const labels = locale === "ja" ? ja : en;
    if (!baseURL) throw new Error("runtime fixtureの専用originが必要です。");
    await signInStaff(page.request, baseURL);
    await page.context().addCookies([{ name: "tablecast_locale", value: locale, url: baseURL }]);
    const response = await page.goto("/member/tablecast-komorebi/memories");
    expect(response?.headers()["cache-control"]).toBe("private, no-store");
    expect(await response?.text()).toContain(labels.customer_consent_title);
    await expect(page).toHaveURL(/\/member\/tablecast-komorebi\/?$/);
    await expect(
      page.getByRole("button", { name: labels.customer_enrol, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: labels.customer_points_balance })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: labels.customer_enrol, exact: true }).click();
    await expect(page.getByRole("heading", { name: labels.customer_points_balance })).toBeVisible();
    await expect(page.getByText("0 pt", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: labels.customer_owned_coupons })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll<HTMLElement>("main *")]
        .filter((element) =>
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          ),
        )
        .map((element) => ({
          element,
          size: Number.parseFloat(getComputedStyle(element).fontSize),
        }));
      for (const { element, size } of sizes) element.style.fontSize = `${size * 2}px`;
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.reload();
    await page.getByRole("link", { name: labels.customer_memories, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: labels.customer_memories, exact: true }),
    ).toBeVisible();
    const back = page.getByRole("link", { name: new RegExp(labels.customer_back_to_store) });
    await expect(back).toContainText("京料理こもれび");
    await back.click();
    await expect(page.getByRole("heading", { name: labels.customer_points_balance })).toBeVisible();
  });
}
