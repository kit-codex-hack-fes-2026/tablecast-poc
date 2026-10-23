import { expect, it, vi } from "vitest";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import "../../styles.css";
import { catalogOptions } from "./catalog-query";
import { fixture, showMenu } from "./test-support/menu-collection-fixture";

it("カテゴリに所属商品と件数を表示し、プランに価格・対象・終了前の注文制約を表示する", async () => {
  const value = structuredClone(catalog);
  value.configuration.plans = [
    {
      id: "tablecast-plan",
      text: product.text,
      pricePerPerson: 3200,
      durationMinutes: 90,
      lastOrderMinutesBeforeEnd: 15,
      productIds: [product.id],
      categoryIds: [product.categoryId],
      tags: ["seasonal"],
      maxPerOrder: 1,
      maxTotalPerPerson: 10,
      intervalSeconds: 0,
      excludedOptionIds: [],
      includedOptionSurcharge: false,
    },
  ];
  const { screen, router } = await showMenu(
    value,
    "ja",
    "/admin/stores/tablecast-story/menu/categories",
  );
  const category = screen.getByRole("row").filter({ hasText: "日本酒" });
  await expect.element(category.getByText("2", { exact: true })).toBeVisible();
  await expect.element(category.getByText(/こもれび 月凪/)).toBeVisible();
  await router.navigate({
    to: "/admin/stores/$storeId/menu/$section",
    params: { storeId: value.storeId, section: "plans" },
  });
  await expect
    .element(screen.getByRole("columnheader", { name: ja.editor_plan_price }))
    .toBeVisible();
  await expect.element(screen.getByText("¥3,200", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("利用時間 90分", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("ラストオーダー 終了15分前", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText(/日本酒 · seasonal/)).toBeVisible();

  await screen.getByRole("link", { name: product.text.ja.displayName, exact: true }).click();
  await expect
    .element(screen.getByRole("heading", { name: ja.editor_tags, exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("seasonal", { exact: true })).toBeVisible();
});

it("初回読込・通信失敗・登録なしを区別し、再取得失敗でも商品と検索条件を残す", async () => {
  const initial = Promise.withResolvers<Response>();
  const retry = Promise.withResolvers<Response>();
  const refresh = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(retry.promise)
      .mockReturnValueOnce(refresh.promise),
  );
  const { screen } = await showMenu(undefined);
  await expect
    .element(screen.getByRole("status").filter({ hasText: ja.common_loading }))
    .toBeVisible();
  const heading = screen.getByRole("heading", { name: ja.editor_products, exact: true });
  await expect.element(heading).toBeVisible();
  const pendingHeading = heading.element().getBoundingClientRect();
  await expect.element(screen.getByRole("table")).toBeVisible();
  await expect.element(screen.getByText(ja.menu_no_items, { exact: true })).not.toBeInTheDocument();
  initial.resolve(Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 }));
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect.element(screen.getByText(ja.menu_no_items, { exact: true })).not.toBeInTheDocument();
  await screen.getByRole("button", { name: ja.common_retry, exact: true }).click();
  retry.resolve(Response.json(catalog));
  await expect
    .element(screen.getByText(product.text.ja.displayName, { exact: true }))
    .toBeVisible();
  const loadedHeading = heading.element().getBoundingClientRect();
  expect([loadedHeading.x, loadedHeading.y, loadedHeading.width, loadedHeading.height]).toEqual([
    pendingHeading.x,
    pendingHeading.y,
    pendingHeading.width,
    pendingHeading.height,
  ]);
  await expect.element(screen.getByRole("table")).toBeVisible();
  await screen.getByRole("searchbox", { name: ja.menu_search }).fill("Sake");
  void fixture.client.refetchQueries({ queryKey: catalogOptions(catalog.storeId).queryKey });
  refresh.resolve(Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 }));
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect
    .element(screen.getByText(product.text.ja.displayName, { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("searchbox", { name: ja.menu_search })).toHaveValue("Sake");
  const empty = structuredClone(catalog);
  empty.configuration.products = [];
  fixture.client.setQueryData(catalogOptions(catalog.storeId).queryKey, empty);
  await screen.getByRole("searchbox", { name: ja.menu_search }).fill("");
  await expect.element(screen.getByText(ja.menu_no_items, { exact: true })).toBeVisible();
});

it("公開確認から元のプラン一覧へ検索とページを戻し、別の一覧へ進むと条件を引き継がない", async () => {
  const { screen, router } = await showMenu(
    catalog,
    "ja",
    "/admin/stores/tablecast-story/menu/changes/tablecast-published-draft?q=Sake&page=2&returnSection=plans",
  );
  await screen.getByRole("link", { name: ja.workflow_view_published }).click();
  expect(router.state.location.pathname).toBe("/admin/stores/tablecast-story/menu/plans");
  expect(router.state.location.search).toEqual({ q: "Sake", page: 2 });
  router.history.back();
  await screen.getByRole("link", { name: ja.editor_products, exact: true }).click();
  expect(router.state.location.pathname).toBe("/admin/stores/tablecast-story/menu/products");
  expect(router.state.location.search).toEqual({});
});

function mockCastVoices() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.origin,
      );
      if (url.pathname === "/api/admin/stores/tablecast-story/voices")
        return Response.json({
          voices: [{ voiceId: "marin", displayName: "Marin", langCode: "ja" }],
          nextPageToken: null,
        });
      throw new Error(`未定義の要求: ${url.pathname}`);
    }),
  );
}

it("閲覧権限で商品一覧から接客概要へ移動してもhooksと一覧表示が切り替わり、編集入口を出さない", async () => {
  mockCastVoices();
  const { screen, router } = await showMenu(catalog);
  await router.navigate({
    to: "/admin/stores/$storeId/menu/$section",
    params: { storeId: catalog.storeId, section: "cast" },
  });
  await expect
    .element(screen.getByRole("heading", { name: ja.editor_cast, exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("table")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("searchbox")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: ja.cast_edit_proactive, exact: true }))
    .not.toBeInTheDocument();
  await router.navigate({
    to: "/admin/stores/$storeId/menu/$section",
    params: { storeId: catalog.storeId, section: "categories" },
  });
  await expect.element(screen.getByRole("table")).toBeVisible();
});

for (const status of ["published", "discarded"] as const) {
  it(`管理者が${status}の接客概要を直接開くと共通ヘッダーに状態と変更確認を示し、編集入口を出さない`, async () => {
    fixture.storeRole = "owner";
    mockCastVoices();
    const { screen } = await showMenu(
      catalog,
      "ja",
      "/admin/stores/tablecast-story/menu/changes/tablecast-published-draft/cast",
      status,
      true,
    );
    const header = screen.getByRole("region", { name: ja.workflow_context });
    await expect.element(header.getByText(ja[`draft_${status}`], { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: ja.cast_edit_proactive, exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: ja.cast_edit_proactive, exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(header.getByRole("link", { name: ja.workflow_review, exact: true }))
      .toHaveAttribute(
        "href",
        "/admin/stores/tablecast-story/menu/changes/tablecast-published-draft?returnSection=cast",
      );
  });
}

vi.mock("../store/store-context", () => ({
  useStore: () => ({ id: "tablecast-story", name: "店舗", role: fixture.storeRole }),
}));
