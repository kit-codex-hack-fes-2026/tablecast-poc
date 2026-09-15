import { test } from "./support/test";
import { expect } from "@playwright/test";
import { adminStateSchema, configDraftSchema, tableStateSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

const text = (name: string) => ({
  ja: { displayName: name, speechName: name, description: "", aliases: [] },
  en: { displayName: name, speechName: name, description: "", aliases: [] },
});

test.use({ trace: "off", actionTimeout: 15_000 });

test("条件を画面で保存・再読込・公開し、客が未充足行を修正して一度だけ注文する", async ({
  page: admin,
  browser,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  const api = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  expect(
    (await admin.request.post("/api/auth/sign-in/email", { data: credentials, headers })).status(),
  ).toBe(200);
  let draft = configDraftSchema.parse(
    await (await admin.request.post(`${api}/drafts`, { headers, data: {} })).json(),
  );
  const configuration = structuredClone(draft.configuration);
  const product = configuration.products.find((item) => item.available);
  if (!product) throw new Error("商品fixtureがありません");
  product.modifiers = [
    {
      id: "tablecast-toppings",
      text: text("トッピング"),
      kind: "multiple",
      min: 0,
      max: 4,
      options: ["X", "A", "B", "C"].map((id) => ({
        id,
        text: text(id),
        available: true,
        priceDelta: 0,
        maxQuantity: 1,
        requires: [],
        excludes: [],
        imageKey: null,
        imageKind: "photograph",
      })),
    },
  ];
  draft = configDraftSchema.parse(
    await (
      await admin.request.put(`${api}/drafts/${draft.id}`, {
        headers,
        data: { configuration, expectedVersion: draft.version },
      })
    ).json(),
  );
  const reviewPath = `/admin/stores/${storeId}/menu/changes/${draft.id}`;
  await admin.goto(`${reviewPath}/products/${product.id}`);
  const owner = admin.getByRole("group", {
    name: "グループ 1：トッピング 選択肢 1：X",
    exact: true,
  });
  await expect(
    owner.getByRole("button", { name: new RegExp(`^${ja.editor_remove_option}`) }),
  ).toBeEnabled();
  await owner.locator("summary").click();
  await owner.getByRole("button", { name: ja.condition_add, exact: true }).first().click();
  const choices = owner.getByRole("combobox", { name: ja.condition_choose });
  await choices.first().fill("A");
  await admin.getByRole("option", { name: /トッピング \/ A/ }).click();
  await owner.getByRole("button", { name: ja.condition_group, exact: true }).click();
  await choices.nth(1).fill("B");
  await admin.getByRole("option", { name: /トッピング \/ B/ }).click();
  await owner.getByRole("button", { name: ja.condition_group, exact: true }).nth(1).click();
  await owner.getByRole("combobox", { name: ja.condition_operator }).nth(1).selectOption("or");
  await choices.nth(2).fill("C");
  await admin.getByRole("option", { name: /トッピング \/ C/ }).click();
  await owner.getByRole("button", { name: ja.condition_negate, exact: true }).last().click();
  const savedResponse = admin.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `${api}/drafts/${draft.id}` &&
      response.request().method() === "PUT",
  );
  await admin.getByRole("button", { name: ja.common_save, exact: true }).click();
  expect((await savedResponse).status()).toBe(200);
  await expect(admin.getByText(ja.admin_unsaved, { exact: true })).toHaveCount(0);
  await admin.reload();
  await expect(
    owner.getByRole("button", { name: new RegExp(`^${ja.editor_remove_option}`) }),
  ).toBeEnabled();
  await owner.locator("summary").click();
  await expect(choices).toHaveCount(3);
  await expect(owner.getByRole("combobox", { name: ja.condition_operator }).nth(1)).toHaveValue(
    "or",
  );
  await admin.goto(reviewPath);
  const validated = admin.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/${draft.id}/validate`),
  );
  await admin.getByRole("button", { name: ja.admin_validate, exact: true }).click();
  expect((await validated).status()).toBe(200);
  await admin.getByRole("button", { name: ja.admin_publish, exact: true }).click();
  const published = admin.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/${draft.id}/publish`),
  );
  await admin
    .getByRole("dialog", { name: ja.workflow_publish_title, exact: true })
    .getByRole("button", { name: ja.admin_publish, exact: true })
    .click();
  expect((await published).status()).toBe(200);

  const state = adminStateSchema.parse(await (await admin.request.get(api)).json());
  const vacant = state.vacantTables[0];
  if (!vacant) throw new Error("空卓がありません");
  expect(
    (
      await admin.request.post(`${api}/tables/open`, {
        headers,
        data: { tableId: vacant.id, guestCount: 1, locale: "ja" },
      })
    ).status(),
  ).toBe(200);
  const context = await browser.newContext({ baseURL, viewport: { width: 768, height: 1024 } });
  try {
    const guest = await context.newPage();
    await guest.goto("/");
    await guest.getByRole("button", { name: ja.pair_begin, exact: true }).click();
    const userCode = await guest.getByLabel(ja.admin_pair_code).textContent();
    expect(
      (
        await admin.request.post(`${api}/devices/approve`, {
          headers,
          data: { tableId: vacant.id, userCode },
        })
      ).status(),
    ).toBe(200);
    await expect(guest.getByRole("banner").getByText(vacant.name, { exact: true })).toBeVisible();
    const current = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
    const lineId = crypto.randomUUID();
    const changed = await guest.request.put("/api/table/cart", {
      headers,
      data: {
        expectedVersion: current.cart.version,
        lines: [
          {
            id: lineId,
            productId: product.id,
            quantity: 1,
            selections: [{ optionId: "X", quantity: 1 }],
          },
        ],
      },
    });
    expect(changed.status()).toBe(200);
    const incomplete = tableStateSchema.parse(await changed.json());
    expect(incomplete.cart.complete).toBe(false);
    expect(incomplete.cart.lines[0]?.conditionIssues).toEqual([
      { optionId: "X", relation: "requires" },
    ]);
    await admin.goto(`/admin/stores/${storeId}/visits/${current.id}?view=orders`);
    await expect(admin.getByRole("tabpanel")).toContainText("トッピング / A");
    await expect(admin.getByRole("tabpanel")).toContainText("トッピング / B");
    await guest.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
    await expect(guest.getByRole("tabpanel")).toContainText(ja.condition_requires);
    await guest
      .getByRole("tabpanel")
      .getByRole("button", { name: ja.kiosk_edit, exact: true })
      .click();
    const details = guest.getByRole("region", { name: product.text.ja.displayName, exact: true });
    await details.getByRole("checkbox", { name: /^A\b/ }).check();
    const updated = guest.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/table/cart" &&
        response.request().method() === "PUT",
    );
    await details.getByRole("button", { name: ja.common_update, exact: true }).click();
    const basket = tableStateSchema.parse(await (await updated).json()).cart;
    expect(basket.complete).toBe(true);
    expect(basket.lines).toHaveLength(1);
    expect(basket.lines[0]?.id).toBe(lineId);
    await guest.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
    await guest.getByRole("button", { name: ja.kiosk_confirm, exact: true }).click();
    await expect(guest.getByText(ja.kiosk_ordered, { exact: true })).toBeVisible();
    const ordered = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
    expect(ordered.orders).toHaveLength(1);
    expect(ordered.orders[0]?.snapshot.lines).toEqual(basket.lines);
  } finally {
    await context.close();
  }
});
