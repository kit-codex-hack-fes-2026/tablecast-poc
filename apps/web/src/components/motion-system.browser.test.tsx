import { table } from "../../.storybook/tablecast-fixtures";
import { CartLines } from "./cart-lines";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { LanguageFields } from "../features/store/language-fields";
import { LocaleProvider } from "../i18n/locale";
import { ActionFeedback } from "./action-feedback";
import { MotionProvider } from "./motion-provider";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import * as Disclosure from "./ui/disclosure";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import * as Tabs from "./ui/tabs";
import "../styles.css";

afterEach(cleanup);

function FeedbackExample() {
  const [state, setState] = useState("pending");
  return (
    <>
      <Button onClick={() => setState("error")}>失敗に切替</Button>
      <Button onClick={() => setState("success")}>成功に切替</Button>
      <ActionFeedback
        pending={state === "pending"}
        error={state === "error" ? new TypeError("network") : null}
        success={state === "success"}
        successMessage="保存しました"
      />
    </>
  );
}

function DialogExample() {
  const [name, setName] = useState("");
  return (
    <Dialog>
      <DialogPrimitive.Trigger render={<Button />}>開く</DialogPrimitive.Trigger>
      <DialogContent>
        <DialogTitle>商品の名前</DialogTitle>
        <label htmlFor="dialog-name">
          商品名
          <Input id="dialog-name" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <DialogClose aria-label="閉じる">閉じる</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

it("Dialogの入退場を途中反転しても重複せず入力とfocusを保つ", async () => {
  await render(<DialogExample />);
  const trigger = page.getByRole("button", { name: "開く", exact: true });
  await trigger.click();
  const input = page.getByRole("textbox", { name: "商品名" });
  await input.fill("季節の御膳");
  await userEvent.keyboard("{Escape}");
  await trigger.click();
  await expect.element(page.getByRole("dialog", { name: "商品の名前" })).toBeVisible();
  await expect.element(input).toHaveValue("季節の御膳");
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  const overlay = document.querySelector('[data-slot="dialog-content"]')?.parentElement
    ?.previousElementSibling;
  if (!overlay) throw new Error("Dialog overlayがありません");
  expect(getComputedStyle(overlay).backdropFilter).toBe("none");
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveFocus();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});

it("Selectを連続開閉してもtriggerが動かず選択とfocusを戻す", async () => {
  await render(
    <div className="w-72 p-4">
      <Select
        defaultValue="ja"
        items={[
          { value: "ja", label: "日本語" },
          { value: "en", label: "English" },
        ]}
      >
        <SelectTrigger aria-label="言語">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ja">日本語</SelectItem>
          <SelectItem value="en">English</SelectItem>
        </SelectContent>
      </Select>
    </div>,
  );
  const trigger = page.getByRole("combobox", { name: "言語" });
  const before = trigger.element().getBoundingClientRect();
  await trigger.click();
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("option", { name: "English" }).click();
  await expect.element(trigger).toHaveTextContent("English");
  await expect.element(trigger).toHaveFocus();
  expect(trigger.element().getBoundingClientRect().x).toBe(before.x);
  expect(trigger.element().getBoundingClientRect().width).toBe(before.width);
});

it("タブを途中で戻してもkeepMountedの入力要素と値が残り旧panelが重ならない", async () => {
  await render(
    <Tabs.Root defaultValue="ja">
      <Tabs.List aria-label="編集言語">
        <Tabs.Tab value="ja">日本語</Tabs.Tab>
        <Tabs.Tab value="en">English</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="ja" keepMounted>
        <label htmlFor="ja-name">
          日本語の商品名
          <Input id="ja-name" defaultValue="御膳" />
        </label>
      </Tabs.Panel>
      <Tabs.Panel value="en" keepMounted>
        <label htmlFor="en-name">
          English product name
          <Input id="en-name" defaultValue="Set meal" />
        </label>
      </Tabs.Panel>
    </Tabs.Root>,
  );
  const field = page.getByRole("textbox", { name: "日本語の商品名" });
  const original = field.element();
  await field.fill("季節の御膳");
  await page.getByRole("tab", { name: "English", exact: true }).click();
  await page.getByRole("tab", { name: "日本語", exact: true }).click();
  await expect.element(field).toHaveValue("季節の御膳");
  expect(field.element()).toBe(original);
  await expect.element(page.getByLabelText("English product name")).not.toBeVisible();
  await expect.element(page.getByRole("tab", { name: "日本語" })).toHaveFocus();
});

it("編集項目の開閉で入力を保ち、閉じた必須入力のエラー時は対象を開いてfocusする", async () => {
  await render(
    <form>
      <Disclosure.Root>
        <Disclosure.Trigger>詳細設定</Disclosure.Trigger>
        <Disclosure.Panel>
          <label htmlFor="display-name">
            表示名
            <Input id="display-name" required />
          </label>
        </Disclosure.Panel>
      </Disclosure.Root>
      <Button type="submit">保存する</Button>
    </form>,
  );
  const toggle = page.getByRole("button", { name: "詳細設定" });
  await toggle.click();
  const name = page.getByRole("textbox", { name: "表示名" });
  await name.fill("季節の御膳");
  const original = name.element();
  await toggle.click();
  await toggle.click();
  await expect.element(name).toHaveValue("季節の御膳");
  expect(name.element()).toBe(original);
  await name.fill("");
  await toggle.click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
  await expect.element(name).toHaveFocus();
  await expect.element(name).toBeInvalid();
});

it("進行から失敗・成功への短い連続更新で古い結果を待たせない", async () => {
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <MotionProvider>
        <FeedbackExample />
      </MotionProvider>
    </LocaleProvider>,
  );
  const liveRegion = page.getByRole("status").element();
  await page.getByRole("button", { name: "失敗に切替" }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "成功に切替" }).click();
  await expect.element(page.getByRole("status")).toHaveTextContent("保存しました");
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(page.getByRole("status").element()).toBe(liveRegion);
});

it("動きを減らす設定では即時に操作でき、通常時は統一された応答時間を使う", async () => {
  await render(
    <>
      <Button>保存</Button>
      <label htmlFor="enabled">
        <Checkbox id="enabled" />
        有効
      </label>
    </>,
  );
  const button = page.getByRole("button", { name: "保存" });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = Number.parseFloat(getComputedStyle(button.element()).transitionDuration);
  expect(duration).toBeCloseTo(reduced ? 0 : 0.15, 3);
  await page.getByRole("checkbox", { name: "有効" }).click();
  await expect.element(page.getByRole("checkbox", { name: "有効" })).toBeChecked();
  const durations = document
    .getAnimations()
    .map((animation) => Number(animation.effect?.getTiming().duration));
  expect(durations.every((value) => !reduced || value <= 1)).toBe(true);
});

it("閉じた編集欄の非選択言語で必須エラーが起きると対象言語と入力へ案内する", async () => {
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <form>
        <Disclosure.Root>
          <Disclosure.Trigger>翻訳を編集</Disclosure.Trigger>
          <Disclosure.Panel>
            <LanguageFields>
              {(language) => (
                <label htmlFor={`translated-${language}`}>
                  {language === "ja" ? "日本語名" : "English name"}
                  <Input
                    id={`translated-${language}`}
                    required
                    defaultValue={language === "ja" ? "御膳" : ""}
                  />
                </label>
              )}
            </LanguageFields>
          </Disclosure.Panel>
        </Disclosure.Root>
        <Button type="submit">保存する</Button>
      </form>
    </LocaleProvider>,
  );
  await page.getByRole("button", { name: "保存する" }).click();
  await expect
    .element(page.getByRole("button", { name: "翻訳を編集" }))
    .toHaveAttribute("aria-expanded", "true");
  await expect
    .element(page.getByRole("tab", { name: "English", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByRole("textbox", { name: "English name" })).toHaveFocus();
  await expect.element(page.getByRole("textbox", { name: "English name" })).toBeInvalid();
});

function CartExample() {
  const first = table.cart.lines[0];
  if (!first) throw new Error("カートfixtureがありません");
  const [lines, setLines] = useState([
    first,
    { ...first, id: "second-line", name: { ja: "お茶", en: "Tea" } },
  ]);
  return (
    <CartLines
      lines={lines}
      onRemove={(line) => setLines((current) => current.filter((item) => item.id !== line.id))}
    />
  );
}

it("カート削除中は旧行を操作できず、残る商品のDOMを保って位置を詰める", async () => {
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <MotionProvider>
        <CartExample />
      </MotionProvider>
    </LocaleProvider>,
  );
  const tea = page.getByText("お茶", { exact: true });
  const original = tea.element();
  const before = original.getBoundingClientRect().y;
  await page.getByRole("button", { name: "削除", exact: true }).first().click();
  expect(tea.element()).toBe(original);
  await expect.poll(() => original.getBoundingClientRect().y).toBeLessThan(before);
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "削除", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "注文かごは空です" })).toBeVisible();
});
