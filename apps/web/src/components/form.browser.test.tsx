import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { LocaleProvider } from "../i18n/locale";
import { useAppForm } from "./form";

afterEach(cleanup);

it.each([false, true])(
  "フォームrootは外部送信ボタンと数値入力を保ち、伝播停止=%sだけを適用する",
  async (stopPropagation) => {
    const saved = vi.fn<(value: { count: number }) => void>();
    const bubbled = vi.fn<(defaultPrevented: boolean) => void>();
    function Example() {
      const form = useAppForm({
        defaultValues: { count: 2 },
        onSubmit: ({ value }) => saved(value),
      });
      return (
        <div onSubmit={(event) => bubbled(event.defaultPrevented)}>
          <form.AppForm>
            <form.Form id="tablecast-root-example" noValidate stopPropagation={stopPropagation}>
              <form.AppField name="count">
                {(field) => <field.NumberField label="人数" min={1} required />}
              </form.AppField>
            </form.Form>
          </form.AppForm>
          <button type="submit" form="tablecast-root-example">
            保存
          </button>
        </div>
      );
    }
    await render(
      <LocaleProvider initialLocale="ja" persist={false}>
        <Example />
      </LocaleProvider>,
    );
    await page.getByRole("spinbutton", { name: "人数" }).fill("5");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect.poll(() => saved.mock.calls).toEqual([[{ count: 5 }]]);
    expect(bubbled.mock.calls).toEqual(stopPropagation ? [] : [[true]]);
    await expect.element(page.getByRole("spinbutton", { name: "人数" })).toHaveValue(5);
  },
);
