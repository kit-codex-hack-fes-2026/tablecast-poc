import { productSchema, optionConditionsSchema, type Product } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import { LocaleProvider } from "../../i18n/locale";
import { OptionConditionsEditor } from "./option-conditions-editor";
import "../../styles.css";

const text = (name: string) => ({
  ja: { displayName: name, speechName: name, description: "", aliases: [] },
  en: { displayName: name, speechName: name, description: "", aliases: [] },
});
const product = productSchema.parse({
  id: "coffee",
  categoryId: "drinks",
  text: text("Coffee"),
  price: 500,
  available: true,
  allergens: {
    contains: [],
    evidence: "unknown",
    crossContact: "unknown",
    vegan: "unknown",
    note: { ja: "", en: "" },
  },
  modifiers: [
    {
      id: "toppings",
      text: text("Toppings"),
      kind: "multiple",
      min: 0,
      max: 4,
      options: ["X", "A", "B", "C"].map((id) => ({
        id,
        text: text(id),
        priceDelta: 0,
        available: true,
      })),
    },
  ],
});
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
function Form({ initial = product }: { initial?: Product }) {
  const [value, setValue] = useState(initial);
  return (
    <main className="max-w-4xl p-4">
      <OptionConditionsEditor
        storeId="tablecast-test"
        product={value}
        optionId="X"
        disabled={false}
        onChange={(change) =>
          setValue({
            ...value,
            modifiers: value.modifiers.map((group) => ({
              ...group,
              options: group.options.map((option) =>
                option.id === "X" ? { ...option, ...change } : option,
              ),
            })),
          })
        }
      />
      <output aria-label="編集結果">
        {JSON.stringify(value.modifiers[0]?.options[0]?.conditions)}
      </output>
    </main>
  );
}
async function setup(locale: "ja" | "en", initial = product) {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  await page.viewport(768, 1024);
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <Form initial={initial} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeでキーボード補完とグループ・否定を編集し、削除後も構造を保つ",
  async ({ locale, labels }) => {
    const screen = await setup(locale);
    await screen.getByRole("button", { name: labels.condition_add, exact: true }).first().click();
    const choose = () => screen.getByRole("combobox", { name: labels.condition_choose });
    await expect.element(choose()).toHaveFocus();
    await choose().fill("A");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect.element(choose()).toHaveValue("Toppings / A");
    await screen.getByRole("button", { name: labels.condition_group, exact: true }).click();
    await expect
      .element(screen.getByRole("combobox", { name: labels.condition_operator }))
      .toHaveValue("and");
    await choose().nth(1).fill("B");
    await page.getByRole("option", { name: /Toppings \/ B/ }).click();
    await screen.getByRole("button", { name: labels.condition_group, exact: true }).nth(1).click();
    await screen
      .getByRole("combobox", { name: labels.condition_operator })
      .nth(1)
      .selectOptions("or");
    await choose().nth(2).fill("C");
    await page.getByRole("option", { name: /Toppings \/ C/ }).click();
    await screen.getByRole("button", { name: labels.condition_negate, exact: true }).last().click();
    const result = () =>
      optionConditionsSchema.parse(
        JSON.parse(screen.getByLabelText("編集結果").element().textContent ?? "null"),
      );
    expect(result()).toEqual({
      version: 2,
      requires: {
        kind: "and",
        children: [
          { kind: "option", optionId: "A" },
          {
            kind: "or",
            children: [
              { kind: "option", optionId: "B" },
              { kind: "not", child: { kind: "option", optionId: "C" } },
            ],
          },
        ],
      },
      excludes: null,
    });
    await screen.getByRole("button", { name: labels.condition_remove, exact: true }).nth(3).click();
    expect(screen.getByLabelText("編集結果").element().textContent).toContain(
      '"kind":"or","children":[{"kind":"not"',
    );
    await expect.element(screen.getByRole("alert").first()).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: labels.condition_add_leaf, exact: true }).first())
      .toHaveFocus();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(768);
  },
);

it("参照切れと候補なしを説明し、API試行の失敗後も入力を保持する", async () => {
  const initial = structuredClone(product);
  const owner = initial.modifiers[0]?.options[0];
  if (!owner) throw new Error("所有する選択肢がありません");
  owner.conditions = {
    version: 2,
    requires: { kind: "option", optionId: "deleted" },
    excludes: null,
  };
  const fetch = vi.fn<() => Promise<Response>>(() =>
    Promise.resolve(Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 })),
  );
  vi.stubGlobal("fetch", fetch);
  const screen = await setup("ja", initial);
  await expect
    .element(screen.getByText(ja.editor_missing_reference, { exact: true }))
    .toBeVisible();
  const choice = screen.getByRole("combobox", { name: ja.condition_choose });
  await choice.fill("no-match");
  await expect.element(page.getByText(ja.condition_no_candidates)).toBeVisible();
  await choice.fill("A");
  await page.getByRole("option", { name: /Toppings \/ A/ }).click();
  await screen.getByText(ja.condition_try, { exact: true }).click();
  await screen.getByRole("button", { name: ja.condition_run }).click();
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect.element(choice).toHaveValue("Toppings / A");
  expect(fetch).toHaveBeenCalledTimes(1);
});
