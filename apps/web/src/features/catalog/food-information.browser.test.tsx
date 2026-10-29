import { type Product, unknownFoodProfile } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { tableEndpoint } from "../../lib/api";
import { product } from "../../test-support/tablecast-fixtures";
import { ProductAllergens } from "../kiosk/product-allergens";
import { FoodChangesEditor, FoodInformationEditor } from "./food-information-editor";
import "../../styles.css";

const clients: QueryClient[] = [];
afterEach(async () => {
  await cleanup();
  for (const instance of clients.splice(0)) instance.clear();
  vi.unstubAllGlobals();
});
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(value);
  return value;
}

function Editor() {
  const [value, setValue] = useState<Product>({
    ...structuredClone(product),
    foodInfo: {
      base: unknownFoodProfile(),
      components: [
        {
          id: "milk",
          name: { ja: "乳の具材", en: "Milk component" },
          profile: unknownFoodProfile(),
        },
      ],
      defaultComponentIds: [],
    },
  });
  const first = value.modifiers[0]?.options[0];
  return (
    <>
      <FoodInformationEditor
        product={value}
        storeId="tablecast-store"
        disabled={false}
        onChange={(change) => setValue({ ...value, ...change })}
      />
      {first && (
        <FoodChangesEditor
          product={value}
          option={first}
          disabled={false}
          onChange={(change) =>
            setValue({
              ...value,
              modifiers: value.modifiers.map((group, index) =>
                index
                  ? group
                  : {
                      ...group,
                      options: group.options.map((option, optionIndex) =>
                        optionIndex ? option : { ...option, ...change },
                      ),
                    },
              ),
            })
          }
        />
      )}
      <output aria-label="saved">
        {JSON.stringify(value.foodInfo)}
        {JSON.stringify(first?.foodChanges)}
      </output>
    </>
  );
}

function Selection() {
  const [selected, setSelected] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setSelected(true)}>
        乳を抜く
      </button>
      <ProductAllergens
        product={product}
        selections={selected ? [{ optionId: "remove-milk", quantity: 1 }] : []}
        endpoint={tableEndpoint}
        configVersion={1}
        tableSessionId="tablecast-food-test"
      />
    </>
  );
}

it.each(["ja", "en"] as const)(
  "%sで分類・根拠・標準構成と選択肢の増減を編集できる",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    const screen = await render(
      <QueryClientProvider client={client()}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <Editor />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await screen.getByText(labels.food_base, { exact: true }).click();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: locale === "ja" ? "乳" : "Milk", exact: true }),
      "contains",
    );
    const halal = screen.getByRole("group", { name: labels.food_halal, exact: true });
    await userEvent.selectOptions(halal.getByRole("combobox"), "no");
    await halal.getByRole("tab", { name: "日本語", exact: true }).click();
    await halal.getByRole("textbox").fill("架空レシピにアルコールを含む。認証なし。");
    await halal.getByRole("tab", { name: "English", exact: true }).click();
    await halal
      .getByRole("textbox")
      .fill("The fictional recipe contains alcohol. No certification.");
    await screen
      .getByText(locale === "ja" ? "乳の具材" : "Milk component", { exact: true })
      .first()
      .click();
    await screen.getByRole("checkbox", { name: labels.food_default_component }).click();
    const changes = screen.getByRole("group", { name: labels.food_changes });
    await changes
      .getByRole("checkbox", { name: locale === "ja" ? "乳の具材" : "Milk component", exact: true })
      .first()
      .click();
    const saved = screen.getByRole("status", { name: "saved" });
    await expect.poll(() => saved.element().textContent).toContain('"milk":"contains"');
    await expect
      .poll(() => saved.element().textContent)
      .toContain('"defaultComponentIds":["milk"]');
    await expect.poll(() => saved.element().textContent).toContain('"add":["milk"]');
    await expect.poll(() => saved.element().textContent).toContain('"status":"no"');
  },
);

it("選択を変えた後の遅い応答を捨て、失敗時に入力を維持して再取得できる", async () => {
  const old = Promise.withResolvers<Response>();
  onTestFinished(() => old.resolve(Response.json({})));
  let calls = 0;
  const updated = {
    ...unknownFoodProfile(),
    allergens: { milk: "not_used" as const },
    basis: {
      ja: "乳の具材を除去した登録情報",
      en: "Recorded information with the milk component removed",
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      calls++;
      if (calls === 1) return old.promise;
      if (calls === 2) return Promise.reject(new Error("offline"));
      return Promise.resolve(
        Response.json({ configVersion: 1, complete: true, foodInformation: updated }),
      );
    }),
  );

  const screen = await render(
    <QueryClientProvider client={client()}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <Selection />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  await expect.element(screen.getByText(ja.food_updating)).toBeVisible();
  await screen.getByRole("button", { name: "乳を抜く" }).click();
  await screen.getByRole("button", { name: ja.food_retry }).click();
  await screen.getByText(ja.food_ingredient_basis, { exact: true }).click();
  await expect.element(screen.getByText(updated.basis.ja)).toBeVisible();
  old.resolve(
    Response.json({
      configVersion: 1,
      complete: true,
      foodInformation: {
        ...updated,
        basis: { ja: "古い乳含有の応答", en: "Old milk response" },
        allergens: { milk: "contains" },
      },
    }),
  );
  await expect.poll(() => calls).toBe(3);
  await expect.element(page.getByText(ja.food_selection_complete)).toBeVisible();
  await expect.element(screen.getByText("古い乳含有の応答")).not.toBeInTheDocument();
  await expect.element(screen.getByText(updated.basis.ja)).toBeVisible();
});
