import { Field } from "@base-ui/react/field";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { LocaleProvider, useI18n } from "../i18n/locale";
import { calendarInputValue } from "../lib/calendar-input";
import { DatePicker } from "./date-picker";
import { DateTimePicker } from "./date-time-picker";
import { Button } from "./ui/button";
import "../styles.css";

afterEach(cleanup);
it.each(["ja", "en"] as const)(
  "%sの日付入力はカレンダー・直接入力・必須・範囲・focusを一貫させる",
  async (locale) => {
    await page.viewport(390, 844);
    const submitted = vi.fn<(value: string) => void>();
    const label = locale === "ja" ? "開始日" : "Start date";
    const choose = locale === "ja" ? "日付を選択" : "Choose a date";
    function Example() {
      const [value, setValue] = useState("2024-02-29");
      const input = useRef<HTMLInputElement>(null);
      return (
        <form
          className="max-w-full p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitted(value);
          }}
        >
          <DatePicker
            ref={input}
            label={label}
            value={value}
            min="2024-02-01"
            max="2024-03-15"
            required
            onValueChange={setValue}
          />
          <Button type="submit">保存</Button>
          <Button onClick={() => input.current?.focus()}>入力へ</Button>
          <output aria-label="保存値">{value}</output>
        </form>
      );
    }
    await render(
      <LocaleProvider initialLocale={locale} persist={false}>
        <Example />
      </LocaleProvider>,
    );
    const input = page.getByRole("textbox", { name: label, exact: true });
    await expect.element(input).toHaveValue(calendarInputValue("2024-02-29", locale));
    await page.getByRole("button", { name: `${label}: ${choose}`, exact: true }).click();
    const selected = page.getByRole("button", {
      name: calendarInputValue("2024-02-29", locale),
      exact: true,
    });
    await expect.element(selected).toHaveFocus();
    await page.screenshot({ path: `../../test-results/tablecast-date-picker-${locale}.png` });
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    await userEvent.keyboard("{ArrowRight}{Enter}");
    await expect.element(input).toHaveValue(calendarInputValue("2024-03-01", locale));
    await expect.element(input).toHaveFocus();
    await page.getByRole("button", { name: `${label}: ${choose}`, exact: true }).click();
    await userEvent.keyboard("{Escape}");
    await expect.element(input).toHaveFocus();
    await input.fill("2024-02-30");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    expect(submitted).not.toHaveBeenCalled();
    await expect.element(input).toHaveValue("2024-02-30");
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await input.fill("2024-03-16");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    expect(submitted).not.toHaveBeenCalled();
    await input.fill(locale === "ja" ? "2024年3月10日" : "10/03/2024");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    expect(submitted).toHaveBeenLastCalledWith("2024-03-10");
    await expect.element(input).toHaveValue(calendarInputValue("2024-03-10", locale));
    await page.getByRole("button", { name: `${label}: ${choose}`, exact: true }).click();
    await page
      .getByRole("button", { name: locale === "ja" ? "日付をクリア" : "Clear date", exact: true })
      .click();
    await expect.element(input).toHaveValue("");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    expect(submitted).toHaveBeenCalledTimes(1);
    await page.getByRole("button", { name: "入力へ", exact: true }).click();
    await expect.element(input).toHaveFocus();
  },
);

it("日時は日付と時刻を独立に修正でき、無効な時刻・必須・範囲を送信しない", async () => {
  const submitted = vi.fn<(value: string) => void>();
  function Example() {
    const [value, setValue] = useState("2024-02-29T09:00");
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted(value);
        }}
      >
        <Field.Root>
          <Field.Label>開始日時</Field.Label>
          <DateTimePicker
            label="開始日時"
            value={value}
            min="2024-02-29T09:00"
            max="2024-03-01T23:59"
            required
            onValueChange={setValue}
          />
        </Field.Root>
        <Button type="submit">保存</Button>
      </form>
    );
  }
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <Example />
    </LocaleProvider>,
  );
  const date = page.getByRole("textbox", { name: "開始日時", exact: true });
  const clock = page.getByRole("textbox", { name: "開始日時: 時刻", exact: true });
  await clock.fill("24:00");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(submitted).not.toHaveBeenCalled();
  await expect.element(date).toHaveValue("2024年2月29日(木)");
  await clock.fill("08:59");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(submitted).not.toHaveBeenCalled();
  await date.fill("2024-03-01");
  await clock.fill("00:00");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(submitted).toHaveBeenLastCalledWith("2024-03-01T00:00");
  await clock.fill("");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  expect(submitted).toHaveBeenCalledTimes(1);
});

it("言語を切り替えても未完成の日付を保持し、完成した日付だけを自然表記へ変換する", async () => {
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <LocaleExample />
    </LocaleProvider>,
  );
  const input = page.getByRole("textbox", { name: "日付", exact: true });
  await input.fill("2026年10月");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "日付: Choose a date", exact: true }))
    .toBeVisible();
  await expect.element(input).toHaveValue("2026年10月");
  await input.fill("21 October 2026");
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect.element(input).toHaveValue("2026年10月21日(水)");
});

function LocaleExample() {
  const [value, setValue] = useState("2026-10-21");
  const { setLocale } = useI18n();
  return (
    <>
      <DatePicker
        label="日付"
        value={value}
        onValueChange={(next) => {
          if (next) setValue(next);
        }}
      />
      <Button onClick={() => setLocale("en")}>English</Button>
      <Button onClick={() => setLocale("ja")}>日本語</Button>
    </>
  );
}

it.each([
  { width: 320, contentWidth: 280, includeTime: false, sameRow: false },
  { width: 390, contentWidth: 318, includeTime: false, sameRow: false },
  { width: 448, contentWidth: 360, includeTime: false, sameRow: true },
  { width: 320, contentWidth: 280, includeTime: true, sameRow: false },
  { width: 390, contentWidth: 318, includeTime: true, sameRow: false },
  { width: 448, contentWidth: 360, includeTime: true, sameRow: true },
])(
  "$width pxの日時入力で完全な英語日付を切らない（時刻: $includeTime）",
  async ({ width, contentWidth, includeTime, sameRow }) => {
    await page.viewport(width, 844);
    const Picker = includeTime ? DateTimePicker : DatePicker;
    await render(
      <LocaleProvider initialLocale="en" persist={false}>
        <div className="p-4">
          {/* フォームの幅を再現し、常設スクロールバーがあれば残る領域へ収める。 */}
          <div className="max-w-full" style={{ width: contentWidth }}>
            <Picker
              label="Start date"
              value={includeTime ? "2026-09-23T09:30" : "2026-09-23"}
              onValueChange={() => {}}
            />
          </div>
        </div>
      </LocaleProvider>,
    );
    const input = page.getByRole("textbox", { name: "Start date", exact: true });
    await expect.element(input).toHaveValue(calendarInputValue("2026-09-23", "en"));
    // Intlの句読点差は認めるが、曜日・日・完全な月名・年の省略は認めない。
    const dateInput = input.element();
    if (!(dateInput instanceof HTMLInputElement)) throw new Error("日付の入力がありません");
    expect(dateInput.value).toMatch(/^Wednesday,? 23 September 2026$/);
    expect(dateInput.scrollWidth).toBeLessThanOrEqual(dateInput.clientWidth);
    const inputStyle = getComputedStyle(dateInput);
    expect(Number.parseFloat(inputStyle.fontSize)).toBe(16);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    const choose = page.getByRole("button", { name: "Start date: Choose a date" });
    const buttonBounds = choose.element().getBoundingClientRect();
    const inputBounds = input.element().getBoundingClientRect();
    const onSameRow =
      buttonBounds.top + buttonBounds.height / 2 === inputBounds.top + inputBounds.height / 2;
    expect(onSameRow).toBe(sameRow);
    if (width === 390)
      await page.screenshot({
        path: `../../test-results/tablecast-date-input-${includeTime ? "datetime" : "date"}-390.png`,
      });
  },
);
