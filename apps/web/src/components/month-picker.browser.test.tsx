import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { LocaleProvider } from "../i18n/locale";
import "../styles.css";
import { MonthPicker } from "./month-picker";
afterEach(cleanup);
it.each(["ja", "en"] as const)(
  "%sの月選択は年を移動して確定し、Escapeでfocusを戻す",
  async (locale) => {
    await page.viewport(390, 844);
    function Example() {
      const [value, setValue] = useState("2026-10");
      return (
        <>
          <MonthPicker
            value={value}
            onChange={setValue}
            label={locale === "ja" ? "利用状況の対象月" : "Usage month"}
          />
          <output aria-label="選択値">{value}</output>
        </>
      );
    }
    await render(
      <LocaleProvider initialLocale={locale} persist={false}>
        <Example />
      </LocaleProvider>,
    );
    const trigger = page.getByRole("button", {
      name: locale === "ja" ? "利用状況の対象月: 2026年10月" : "Usage month: October 2026",
      exact: true,
    });
    await trigger.click();
    const selected = page.getByRole("button", {
      name: locale === "ja" ? "2026年10月" : "October 2026",
      exact: true,
    });
    await expect.element(selected).toHaveFocus();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    await page
      .getByRole("button", { name: locale === "ja" ? "前年" : "Previous year", exact: true })
      .click();
    await page
      .getByRole("button", { name: locale === "ja" ? "2025年12月" : "December 2025", exact: true })
      .click();
    await expect.element(page.getByRole("status", { name: "選択値" })).toHaveTextContent("2025-12");
    const updated = page.getByRole("button", {
      name: locale === "ja" ? "利用状況の対象月: 2025年12月" : "Usage month: December 2025",
      exact: true,
    });
    await expect.element(updated).toHaveFocus();
    await updated.click();
    await userEvent.keyboard("{Escape}");
    await expect.element(updated).toHaveFocus();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  },
);
