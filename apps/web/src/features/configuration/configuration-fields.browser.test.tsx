import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { product } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { BilingualFields } from "./configuration-fields";

afterEach(cleanup);

it.each(["ja", "en"] as const)(
  "%sの表示名・説明・検索名の編集は他の項目と言語を保ち、入力を再マウントしない",
  async (locale) => {
    const changed = vi.fn<(value: typeof product.text) => void>();
    const labels = locale === "ja" ? ja : en;
    function Example() {
      const [value, setValue] = useState(() => structuredClone(product.text));
      return (
        <BilingualFields
          value={value}
          onChange={(next) => {
            setValue(next);
            changed(next);
          }}
        />
      );
    }
    await render(
      <LocaleProvider initialLocale={locale} persist={false}>
        <Example />
      </LocaleProvider>,
    );
    const name = page.getByRole("textbox", { name: new RegExp(labels.admin_display_name) });
    const description = page.getByRole("textbox", { name: new RegExp(labels.admin_description) });
    const aliases = page.getByRole("textbox", { name: new RegExp(labels.editor_aliases) });
    await name.fill("更新した商品");
    await description.fill("更新した説明");
    await aliases.fill("検索名1\n検索名2");
    const expected = structuredClone(product.text);
    expected[locale] = {
      ...expected[locale],
      displayName: "更新した商品",
      description: "更新した説明",
      aliases: ["検索名1", "検索名2"],
    };
    await expect.poll(() => changed.mock.lastCall?.[0]).toEqual(expected);
    await expect.element(name).toHaveValue("更新した商品");
    await expect.element(description).toHaveValue("更新した説明");
    await expect.element(aliases).toHaveFocus();
  },
);
