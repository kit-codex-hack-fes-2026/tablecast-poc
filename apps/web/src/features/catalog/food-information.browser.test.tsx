import { foodClassification, type Product, unknownFoodProfile } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { FoodInformationView } from "../../components/food-information";
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
    await screen
      .getByRole("combobox", { name: locale === "ja" ? "乳" : "Milk", exact: true })
      .click();
    await page.getByRole("option", { name: labels.food_contains, exact: true }).click();
    const halal = screen.getByRole("group", { name: labels.food_halal, exact: true });
    await userEvent.selectOptions(
      halal.getByRole("combobox", { name: labels.food_suitability, exact: true }),
      "no",
    );
    await halal.getByRole("checkbox", { name: labels.food_reason_alcohol, exact: true }).click();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: labels.food_halal_certification, exact: true }),
      "not_certified",
    );
    await screen.getByRole("checkbox", { name: labels.food_contact_oil, exact: true }).click();
    await expect.element(halal.getByRole("textbox")).not.toBeInTheDocument();
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
    await expect.poll(() => saved.element().textContent).toContain('"reasons":["alcohol"]');
    await expect
      .poll(() => saved.element().textContent)
      .toContain('"halalCertification":"not_certified"');
    await expect
      .poll(() => saved.element().textContent)
      .toContain('"crossContactSources":["shared_frying_oil"]');
  },
);

it("選択を変えた後の遅い応答を捨て、失敗時に入力を維持して再取得できる", async () => {
  const old = Promise.withResolvers<Response>();
  onTestFinished(() => old.resolve(Response.json({})));
  let calls = 0;
  const updated = {
    ...unknownFoodProfile(),
    allergens: { milk: "not_used" as const },
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
  const allergens = screen.getByRole("list", { name: ja.food_allergens });
  await expect.element(allergens.getByText(ja.food_unknown, { exact: true })).toBeVisible();
  old.resolve(
    Response.json({
      configVersion: 1,
      complete: true,
      foodInformation: {
        ...updated,
        allergens: { milk: "contains" },
      },
    }),
  );
  await expect.poll(() => calls).toBe(3);
  await expect.element(page.getByText(ja.food_selection_complete)).toBeVisible();
  await expect
    .element(screen.getByLabelText("乳: 不使用", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByLabelText("乳: 含有", { exact: true })).not.toBeInTheDocument();
});

it.each(["ja", "en"] as const)(
  "%sで分類名を示し、含有だけを表示して食事区分の適合と不適合を区別する",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    const value = unknownFoodProfile();
    value.allergens = { milk: "contains", egg: "not_used" };
    value.dietary.vegan = { status: "no", reasons: ["animal_ingredients"] };
    value.dietary.vegetarian = { status: "yes", reasons: ["ingredients_confirmed"] };
    const screen = await render(
      <LocaleProvider initialLocale={locale} persist={false}>
        <FoodInformationView value={value} />
      </LocaleProvider>,
    );
    const milk = screen.getByLabelText(
      `${locale === "ja" ? "乳" : "Milk"}: ${labels.food_contains}`,
      { exact: true },
    );
    const egg = screen.getByLabelText(
      `${locale === "ja" ? "卵" : "Egg"}: ${labels.food_not_used_short}`,
      { exact: true },
    );
    const wheat = screen.getByLabelText(
      `${locale === "ja" ? "小麦" : "Wheat"}: ${labels.food_unknown}`,
      { exact: true },
    );
    await expect.element(milk).toHaveAttribute("data-variant", "destructive");
    await expect.element(egg).not.toBeInTheDocument();
    await expect.element(wheat).not.toBeInTheDocument();
    await expect.element(screen.getByText(labels.food_allergens, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(labels.food_dietary, { exact: true })).toBeVisible();
    const allergens = screen.getByRole("list", { name: labels.food_allergens });
    await expect.element(allergens.getByText(labels.food_unknown, { exact: true })).toBeVisible();
    await expect
      .element(allergens.getByText(labels.food_allergens_none, { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByLabelText(`${labels.food_vegan}: ${labels.food_no}`, { exact: true }))
      .toHaveAttribute("data-variant", "destructive");
    await expect.element(screen.getByRole("list", { name: labels.food_allergens })).toBeVisible();
    await expect
      .element(
        screen.getByLabelText(`${labels.food_vegetarian_short}: ${labels.food_yes}`, {
          exact: true,
        }),
      )
      .toHaveAttribute("data-variant", "success");
    await expect
      .element(screen.getByText(labels.food_certification_unknown, { exact: false }))
      .toBeVisible();

    expect(screen.container.querySelector("details,summary,[data-slot=accordion]")).toBeNull();
    const row = screen.getByRole("list", { name: labels.food_dietary });
    row.element().focus();
    await userEvent.keyboard("[ArrowRight]");
    await expect.poll(() => row.element().scrollLeft).toBeGreaterThan(0);
  },
);

it("全品目の不使用が確認されたときだけアレルギーなしと表示する", async () => {
  const value = unknownFoodProfile();
  for (const item of foodClassification.allergens) value.allergens[item.id] = "not_used";
  const screen = await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <FoodInformationView value={value} />
    </LocaleProvider>,
  );
  const allergens = screen.getByRole("list", { name: ja.food_allergens });
  await expect.element(allergens.getByText(ja.food_allergens_none, { exact: true })).toBeVisible();
  await expect
    .element(allergens.getByText(ja.food_unknown, { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByLabelText("乳: 不使用", { exact: true }))
    .not.toBeInTheDocument();
});
