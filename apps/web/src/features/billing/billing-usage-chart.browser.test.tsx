import { afterEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { LocaleProvider } from "../../i18n/locale";
import { billingFixture } from "./billing-fixture";
import type { Billing } from "./billing-query";
import { BillingUsageChart } from "./billing-usage-chart";
import "../../styles.css";

const daily = Array.from({ length: 31 }, (_, index) => ({
  day: Date.UTC(2026, 9, index + 1),
  seconds: index === 0 ? 60 : index === 1 ? 120 : 0,
  chargeMicros: index === 0 ? 1250000 : index === 1 ? 2500000 : 0,
}));
const fixture = { ...billingFixture, daily } satisfies Billing;
afterEach(async () => {
  await cleanup();
  document.documentElement.style.fontSize = "";
  await page.viewport(1024, 768);
});
async function show(data: Billing = fixture, locale: "ja" | "en" = "ja") {
  await render(
    <LocaleProvider initialLocale={locale} persist={false}>
      <BillingUsageChart data={data} />
    </LocaleProvider>,
  );
}
it("日別の音声時間を分で表示し、矢印キーと数値表で日ごとの値を確認できる", async () => {
  await show();
  await expect.element(page.getByText("3 分", { exact: true })).toBeVisible();
  const chart = page.getByRole("slider");
  await userEvent.click(chart);
  await userEvent.keyboard("{Home}");
  await expect.element(chart).toHaveAttribute("aria-valuenow", "1");
  await expect.element(chart).toHaveAttribute("aria-valuetext", "10月1日 · 1 分");
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(chart).toHaveAttribute("aria-valuetext", "10月2日 · 2 分");
  await expect.element(chart).toHaveFocus();
  await userEvent.click(page.getByText("日ごとの数値を表示", { exact: true }));
  await expect.element(page.getByRole("table")).toBeVisible();
  expect(document.querySelectorAll("tbody tr")).toHaveLength(31);
  await expect
    .element(page.getByRole("rowheader", { name: "10月31日", exact: true }))
    .toBeVisible();
});
it("管理者だけが日別料金へ切り替えられ、memberの画面に料金を含めない", async () => {
  await show({
    ...fixture,
    daily: daily.map((row, index) =>
      index < 2 ? { ...row, chargeMicros: index === 0 ? -1000 : 1000 } : row,
    ),
  });
  await userEvent.click(page.getByRole("button", { name: "AI利用料金", exact: true }));
  await expect.element(page.getByRole("paragraph").filter({ hasText: /^¥0$/ })).toBeVisible();
  expect(document.body.textContent).not.toContain("この期間のAI利用はありません");
  const chart = page.getByRole("slider");
  await userEvent.click(chart);
  await userEvent.keyboard("{Home}");
  await expect.element(chart).toHaveAttribute("aria-valuetext", "10月1日 · > -¥0.01");
  await expect
    .element(page.getByRole("button", { name: "AI利用料金", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await cleanup();
  await show({
    ...fixture,
    canManage: false,
    financial: null,
    daily: daily.map((row) => ({ day: row.day, seconds: row.seconds })),
  });
  expect(document.body.textContent).not.toContain("AI利用料金");
  expect(document.body.textContent).not.toContain("¥");
  await expect.element(page.getByText("3 分", { exact: true })).toBeVisible();
});
it("利用のない期間は0を表示し、狭い英語画面と文字拡大でも日付を選べる", async () => {
  await page.viewport(390, 844);
  document.documentElement.style.fontSize = "20px";
  await show(
    { ...fixture, daily: daily.map((row) => ({ ...row, seconds: 0, chargeMicros: 0 })) },
    "en",
  );
  await expect.element(page.getByRole("paragraph").filter({ hasText: /^0 min$/ })).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  const chart = page.getByRole("slider");
  await userEvent.click(chart);
  await userEvent.keyboard("{End}");
  await expect.element(chart).toHaveAttribute("aria-valuenow", "31");
  await expect.element(chart).toHaveAttribute("aria-valuetext", "31 Oct · 0 min");
  await page.screenshot({
    path: "../../../test-results/tablecast-billing-chart-narrow-en.png",
    fullPage: true,
  });
});
