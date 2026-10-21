import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { LocaleProvider } from "../i18n/locale";
import "../styles.css";
import { LanguageLabel } from "./language-label";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { NativeSelect } from "./ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { UserIdentity } from "./user-identity";

afterEach(async () => {
  await cleanup();
  await page.viewport(1024, 768);
});

it("主操作の文字を支える面が消えず、状態付き操作はhoverでも意味色を維持する", async () => {
  await render(
    <div className="flex gap-3 p-4">
      <Button>保存する</Button>
      <Badge variant="success" render={<a href="#published" aria-label="公開済み" />}>
        公開済み
      </Badge>
    </div>,
  );
  const primary = page.getByRole("button", { name: "保存する" }).element();
  const style = getComputedStyle(primary);
  expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(style.backgroundColor).not.toBe("transparent");
  expect(style.backgroundImage).not.toBe("none");
  expect(primary.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
  const state = page.getByRole("link", { name: "公開済み" });
  const initialText = getComputedStyle(state.element()).color;
  const initialSurface = getComputedStyle(state.element()).backgroundColor;
  await userEvent.hover(state);
  await expect
    .poll(() => getComputedStyle(state.element()).backgroundColor)
    .not.toBe(initialSurface);
  expect(getComputedStyle(state.element()).color).toBe(initialText);
  await userEvent.keyboard("{Tab}");
  await expect.element(primary).toHaveFocus();
});

it.each([390, 1024])(
  "%ipxで選択の矢印が文字や境界に重ならず、国旗は文字の補助サイズに収まる",
  async (width) => {
    await page.viewport(width, 844);
    await render(
      <LocaleProvider initialLocale="en" persist={false}>
        <div className="grid max-w-sm gap-4 p-4">
          <label htmlFor="tablecast-role-example" className="grid gap-2">
            Role
            <NativeSelect id="tablecast-role-example" defaultValue="admin" className="w-full px-3">
              <option value="admin">Restaurant administrator</option>
              <option value="member">Member</option>
            </NativeSelect>
          </label>
          <Select
            defaultValue="en"
            items={[
              { value: "en", label: "English" },
              { value: "ja", label: "日本語" },
            ]}
          >
            <SelectTrigger aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">
                <LanguageLabel locale="en" />
              </SelectItem>
              <SelectItem value="ja">
                <LanguageLabel locale="ja" />
              </SelectItem>
            </SelectContent>
          </Select>
          <LanguageLabel locale="en" />
          <UserIdentity user={{ name: "Alex Morgan", email: "alex.morgan@example.test" }} />
        </div>
      </LocaleProvider>,
    );
    const native = page.getByRole("combobox", { name: "Role" }).element();
    const icon = native.parentElement?.querySelector("svg");
    if (!icon) throw new Error("選択矢印がありません");
    const control = native.getBoundingClientRect();
    const arrow = icon.getBoundingClientRect();
    expect(Math.abs(arrow.top + arrow.height / 2 - control.top - control.height / 2)).toBeLessThan(
      1,
    );
    expect(control.right - arrow.right).toBeGreaterThanOrEqual(12);
    expect(parseFloat(getComputedStyle(native).paddingRight)).toBeGreaterThanOrEqual(
      arrow.width + 20,
    );
    const trigger = page.getByRole("combobox", { name: "Language" });
    const triggerRect = trigger.element().getBoundingClientRect();
    await trigger.click();
    await userEvent.keyboard("{Escape}");
    await expect.element(trigger).toHaveFocus();
    expect(trigger.element().getBoundingClientRect().x).toBe(triggerRect.x);
    for (const flag of document.querySelectorAll<HTMLImageElement>('img[src^="/flags/"]')) {
      expect(flag.getBoundingClientRect().width).toBeLessThanOrEqual(20);
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  },
);
