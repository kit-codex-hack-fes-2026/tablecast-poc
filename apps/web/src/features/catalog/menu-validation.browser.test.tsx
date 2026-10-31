import {
  type Configuration,
  configurationSchema,
  type OptionCondition,
} from "@tablecast/api/schema";
import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { catalog } from "../../test-support/tablecast-fixtures";
import "../../styles.css";
import { draftId, mountForm, storeId } from "./test-support/menu-item-fixture";

it.each([
  {
    boundary: "件数",
    locale: "ja",
    labels: ja,
    aliases: Array.from({ length: 31 }, (_, index) => `別名${index}`),
    path: ["configuration", "products", 0, "text", "ja", "aliases"],
    message: "30件以下にしてください",
  },
  {
    boundary: "文字数",
    locale: "ja",
    labels: ja,
    aliases: ["a".repeat(101)],
    path: ["configuration", "products", 0, "text", "ja", "aliases", 0],
    message: "100文字以下にしてください",
  },
] as const)(
  "別名の$boundary上限の不備を条件エラーにせず、APIの項目パスを表示して修正後に保存する",
  async ({ locale, labels, aliases, path, message }) => {
    const saved: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url).pathname;
      if (url === "/api/auth/organization/get-full-organization" || url === "/api/auth/get-session")
        return Response.json(null);
      if (url === `/api/admin/stores/${storeId}/drafts/${draftId}` && request.method === "PUT") {
        const body: { configuration: Configuration } = await request.json();
        saved.push(body.configuration);
        if (saved.length === 1)
          return Response.json(
            {
              error: {
                code: "INVALID_INPUT",
                details: [{ path, code: "too_big", messages: { ja: message, en: message } }],
              },
            },
            { status: 422 },
          );
        return Response.json({ ...initial, version: 2, configuration: body.configuration });
      }
      throw new Error(`未定義の要求: ${request.method} ${url}`);
    });
    const initial = await mountForm(locale);
    const field = page
      .getByRole("textbox", { name: `${labels.common_ja} ${labels.editor_aliases}`, exact: true })
      .first();
    await field.fill(aliases.join("\n"));
    await page.getByRole("button", { name: labels.common_save, exact: true }).click();
    await expect
      .element(page.getByRole("alert").filter({ hasText: message }))
      .toMatchTextContent(path.join(" · "));
    await expect
      .element(page.getByText(labels.condition_invalid, { exact: true }))
      .not.toBeInTheDocument();
    await expect.element(field).toHaveValue(aliases.join("\n"));
    await field.fill("修正した別名");
    await page.getByRole("button", { name: labels.common_save, exact: true }).click();
    await expect.poll(() => saved.length).toBe(2);
    await expect
      .element(page.getByRole("status").filter({ hasText: labels.account_saved }))
      .toBeVisible();
  },
);

it.each([
  { locale: "ja", labels: ja, scope: "product", count: 1 },
  { locale: "ja", labels: ja, scope: "configuration", count: 65 },
] as const)(
  "$scopeの条件合計上限を超えたら理由を表示して条件へfocusし、削減後に保存する",
  async ({ locale, labels, scope, count }) => {
    const configuration = structuredClone(catalog.configuration);
    const source = configuration.products[0];
    const group = source?.modifiers[0];
    const option = group?.options[0];
    const target = group?.options[1];
    if (!source || !group || !option || !target) throw new Error("条件上限fixtureがありません");
    configuration.products = Array.from({ length: count }, (_productValue, productIndex) => {
      const productId =
        productIndex === 0 ? source.id : `tablecast-condition-product-${productIndex}`;
      const targetId = `${productId}-target`;
      const ownerCount = productIndex === 64 ? 1 : 16;
      return {
        ...source,
        id: productId,
        modifiers: [
          {
            ...group,
            id: `${productId}-group`,
            options: [
              ...Array.from({ length: ownerCount }, (_optionValue, index) => {
                const expression: OptionCondition =
                  productIndex === 64
                    ? { kind: "option", optionId: targetId }
                    : {
                        kind: "and",
                        children: Array.from({ length: 7 }, (_childValue, childIndex) => ({
                          kind: "or",
                          children: Array.from(
                            {
                              length:
                                scope === "configuration" &&
                                productIndex === 0 &&
                                index === 0 &&
                                childIndex === 0
                                  ? 7
                                  : 8,
                            },
                            () => ({ kind: "option", optionId: targetId }),
                          ),
                        })),
                      };
                return {
                  ...option,
                  id: `${productId}-owner-${index}`,
                  conditions: { version: 2 as const, requires: expression, excludes: null },
                };
              }),
              { ...target, id: targetId },
            ],
          },
        ],
      };
    });
    expect(configurationSchema.safeParse(configuration).success).toBe(true);
    // 全体上限の65商品・65,536ノードを保ち、編集対象だけ末尾の小さな商品にする。
    const edited = scope === "configuration" ? configuration.products.at(-1) : source;
    if (!edited) throw new Error("条件上限の編集対象がありません");
    let saves = 0;
    let saved: Configuration | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (
        path === "/api/auth/organization/get-full-organization" ||
        path === "/api/auth/get-session"
      )
        return Response.json(null);
      if (path === `/api/admin/stores/${storeId}/drafts/${draftId}` && request.method === "PUT") {
        const body: { configuration: unknown } = await request.json();
        saves++;
        saved = configurationSchema.parse(body.configuration);
        return Response.json({
          ...initial,
          version: 2,
          configuration: saved,
        });
      }
      throw new Error(`未定義の要求: ${request.method} ${path}`);
    });
    const initial = await mountForm(locale, configuration, edited.id);
    const owner = page.getByRole("group", {
      name: "グループ 1：容量 選択肢 1：60 mL",
      exact: true,
    });
    await owner.getByText(labels.editor_option_details, { exact: true }).click();
    await owner.getByRole("button", { name: labels.condition_add, exact: true }).click();
    await owner.getByRole("combobox", { name: labels.condition_choose }).last().fill("90 mL");
    await page.getByRole("option", { name: /90 mL/ }).click();
    await owner.getByText(labels.editor_option_details, { exact: true }).click();
    await page.getByRole("button", { name: labels.common_save, exact: true }).click();
    await expect
      .element(
        page.getByRole("alert").filter({
          hasText:
            scope === "product"
              ? labels.condition_product_limit
              : labels.condition_configuration_limit,
        }),
      )
      .toBeVisible();
    expect(saves).toBe(0);
    await expect
      .element(
        owner
          .getByRole("combobox", {
            name: scope === "configuration" ? labels.condition_choose : labels.condition_operator,
          })
          .first(),
      )
      .toHaveFocus();
    await owner.getByRole("button", { name: labels.condition_remove, exact: true }).last().click();
    await page.getByRole("button", { name: labels.common_save, exact: true }).click();
    await expect.poll(() => saves).toBe(1);
    expect(saved).toEqual(configuration);
    await expect
      .element(page.getByRole("status").filter({ hasText: labels.account_saved }))
      .toBeVisible();
  },
  30000,
);
