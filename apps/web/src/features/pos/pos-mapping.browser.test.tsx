import type { Locale } from "@tablecast/api/schema";
import { posMappingsUpdateSchema } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { posCatalogOptions, posDevicesOptions, posSettingsOptions } from "./pos-query";
import { StorePosSettings } from "./store-pos";
import {
  posDevicesFixture,
  posMappingCatalogFixture,
  posMappingSettingsFixture,
} from "./test-support/pos-fixture";
import { renderPos as render } from "./test-support/pos-render";

let client: QueryClient;
let viewport: { height: number; width: number };
let unexpected: string[];
beforeEach(async () => {
  viewport = { height: window.innerHeight, width: window.innerWidth };
  await page.viewport(1180, 820);
  unexpected = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(
    posCatalogOptions("tablecast-store", "tablecast-location").queryKey,
    posMappingCatalogFixture,
  );
  client.setQueryData(
    posDevicesOptions("tablecast-store", "tablecast-location").queryKey,
    posDevicesFixture,
  );
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(viewport.width, viewport.height);
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});
const filter = (label: string, count: number) =>
  page.getByRole("button", { name: new RegExp(`^${label}\\s*${count}$`) });
const select = (name: string, kind: "option" | "product", parent?: string) =>
  page.getByRole("combobox", {
    name: `${parent ? parent + " · " : ""}${name} · ${ja[kind === "product" ? "pos_mapping_product" : "pos_mapping_option"]}`,
  });
async function renderMappings(settings = posMappingSettingsFixture, locale: Locale = "ja") {
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false} staffOnly>
        <MotionProvider>
          <main className="h-dvh overflow-y-auto p-6">
            <StorePosSettings storeId="tablecast-store" canEdit settings={settings} />
          </main>
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("非表示行を含む全体件数を保ち、未対応・重複・要確認の修正を一覧へ直ちに反映する", async () => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    unexpected.push(new Request(input, init).url);
    return Response.json({}, { status: 500 });
  });
  await renderMappings();
  for (const [label, count] of [
    [ja.pos_mapping_filter_all, 9],
    [ja.pos_mapping_filter_mapped, 3],
    [ja.pos_mapping_filter_unmapped, 1],
    [ja.pos_mapping_filter_duplicate, 4],
    [ja.pos_mapping_filter_review, 1],
  ] as const)
    await expect.element(filter(label, count)).toBeVisible();

  await filter(ja.pos_mapping_filter_duplicate, 4).click();
  page
    .getByRole("heading", { name: ja.pos_mapping, exact: true })
    .element()
    .scrollIntoView({ block: "start" });
  await new Promise(requestAnimationFrame);
  await page.screenshot({
    path: "../../../test-results/tablecast-pos-mapping-review-ja.png",
    fullPage: false,
  });
  await filter(ja.pos_mapping_filter_mapped, 3).click();
  await expect.element(select("共通の選択肢", "option", "煎茶")).toBeVisible();
  await expect.element(select("共通の選択肢", "option", "コーヒー")).toBeVisible();
  await filter(ja.pos_mapping_filter_all, 9).click();
  const search = page.getByRole("searchbox", { name: ja.pos_mapping_search });
  await search.fill("氷");
  await expect.element(select("氷", "option", "ジュース")).toBeVisible();
  const juice = page.getByRole("article", { name: "ジュース", exact: true });
  await expect.element(juice.getByRole("heading", { name: "ジュース", exact: true })).toBeVisible();
  await expect
    .element(juice.getByRole("list", { name: ja.pos_mapping_customisations }))
    .toBeVisible();
  expect(juice.getByRole("listitem").elements()).toHaveLength(1);
  await expect.element(select("ジュース", "product")).toBeVisible();
  await expect.element(select("ケーキ", "product")).not.toBeInTheDocument();
  await expect.element(filter(ja.pos_mapping_filter_all, 9)).toBeVisible();
  await expect.element(filter(ja.pos_mapping_filter_duplicate, 4)).toBeVisible();
  await search.fill("");

  await filter(ja.pos_mapping_filter_duplicate, 4).click();
  await select("コーヒー", "product").selectOptions("tablecast-square-coffee");
  await expect.element(filter(ja.pos_mapping_filter_duplicate, 2)).toBeVisible();
  await expect.element(select("コーヒー", "product")).not.toBeInTheDocument();
  await select("特大", "option", "煎茶").selectOptions("tablecast-square-extra");
  await expect.element(filter(ja.pos_mapping_filter_duplicate, 0)).toBeVisible();
  await filter(ja.pos_mapping_filter_unmapped, 1).click();
  await select("ケーキ", "product").selectOptions("tablecast-square-cake");
  await expect.element(filter(ja.pos_mapping_filter_unmapped, 0)).toBeVisible();
  await filter(ja.pos_mapping_filter_review, 1).click();
  await select("氷", "option", "ジュース").selectOptions("tablecast-square-ice");
  await expect.element(filter(ja.pos_mapping_filter_review, 0)).toBeVisible();
  await expect.element(filter(ja.pos_mapping_filter_mapped, 9)).toBeVisible();
  await expect.element(filter(ja.pos_mapping_filter_all, 9)).toBeVisible();
});

it("管理言語を英語へ戻したとき英訳なしの商品は日本語へ戻しSquareの登録名を保持する", async () => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    unexpected.push(new Request(input, init).url);
    return Response.json({}, { status: 500 });
  });
  const settings = {
    ...posMappingSettingsFixture,
    products: posMappingSettingsFixture.products.map((product) => ({
      ...product,
      name: product.id === "tablecast-tea" ? { ja: "煎茶", ko: "녹차" } : product.name,
      options: product.options.map((option) => ({ ...option, name: { ja: option.name.ja } })),
    })),
  };
  await renderMappings(settings, "ko");
  await expect
    .element(page.getByRole("heading", { name: en.pos_title, exact: true }))
    .toBeVisible();
  const tea = page.getByRole("article", { name: "煎茶", exact: true });
  await expect.element(tea.getByRole("heading", { name: "煎茶", exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("article", { name: "녹차", exact: true }))
    .not.toBeInTheDocument();
  const square = tea.getByRole("combobox", { name: `煎茶 · ${en.pos_mapping_product}` });
  expect(square.element().querySelector("option:checked")?.textContent).toContain("煎茶（店内）");
});

it("共有する選択肢は別商品の行でも同じ入力を表示し、重複警告を許容して一つの対応だけを保存する", async () => {
  let saved: unknown;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (
      request.method === "PUT" &&
      new URL(request.url).pathname === "/api/admin/stores/tablecast-store/pos/mappings"
    ) {
      saved = await request.json();
      return Response.json(posMappingSettingsFixture);
    }
    unexpected.push(`${request.method} ${request.url}`);
    return Response.json({}, { status: 500 });
  });
  await renderMappings();
  const shared = select("共通の選択肢", "option", "煎茶");
  shared.element().focus();
  await shared.selectOptions("tablecast-square-shared-next");
  await expect.element(shared).toHaveFocus();
  await expect
    .element(select("共通の選択肢", "option", "コーヒー"))
    .toHaveValue("tablecast-square-shared-next");
  await expect.element(filter(ja.pos_mapping_filter_duplicate, 4)).toBeVisible();
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(page.getByText(ja.pos_mapping_saved, { exact: true })).toBeVisible();
  expect(saved).toEqual({
    draftId: "tablecast-pos-draft",
    expectedVersion: 4,
    connectionId: "tablecast-pos-connection",
    mappings: [
      { kind: "product", localId: "tablecast-tea", externalId: "tablecast-square-tea" },
      { kind: "option", localId: "tablecast-large", externalId: "tablecast-square-large" },
      { kind: "option", localId: "tablecast-extra", externalId: "tablecast-square-large" },
      { kind: "option", localId: "tablecast-shared", externalId: "tablecast-square-shared-next" },
      { kind: "product", localId: "tablecast-coffee", externalId: "tablecast-square-tea" },
      { kind: "product", localId: "tablecast-juice", externalId: "tablecast-square-juice" },
      { kind: "option", localId: "tablecast-ice", externalId: "tablecast-square-removed" },
    ],
  });
});

it("親商品を未対応にすると既存の選択肢を保持して入力を止め、親を選び直すと再編集できる", async () => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    unexpected.push(new Request(input, init).url);
    return Response.json({}, { status: 500 });
  });
  await renderMappings();
  await select("煎茶", "product").selectOptions("");
  const large = select("大きめ", "option", "煎茶");
  await expect.element(large).toBeDisabled();
  await expect.element(large).toHaveValue("tablecast-square-large");
  expect(large.element().querySelector('option[value="tablecast-square-extra"]')).toBeNull();
  await expect.element(select("共通の選択肢", "option", "コーヒー")).toBeEnabled();
  await expect.element(filter(ja.pos_mapping_filter_review, 4)).toBeVisible();
  const entry = page
    .getByRole("article", { name: "煎茶", exact: true })
    .getByRole("listitem")
    .filter({ has: large });
  expect(
    [...entry.element().querySelectorAll("p")].some(
      (paragraph) => paragraph.textContent === ja.pos_mapping_parent_required,
    ),
  ).toBe(true);
  await select("煎茶", "product").selectOptions("tablecast-square-tea");
  await expect.element(large).toBeEnabled();
  await expect.element(large).toHaveValue("tablecast-square-large");
  await expect
    .element(page.getByText(ja.pos_mapping_parent_required, { exact: true }))
    .not.toBeInTheDocument();
});

it("公開中の商品対応は読取りに留め、検索と絞込みは利用できる", async () => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    unexpected.push(new Request(input, init).url);
    return Response.json({}, { status: 500 });
  });
  await renderMappings({ ...posMappingSettingsFixture, draft: null });
  await expect.element(select("煎茶", "product")).toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: ja.common_save, exact: true }))
    .not.toBeInTheDocument();
  const search = page.getByRole("searchbox", { name: ja.pos_mapping_search });
  await expect.element(search).toBeEnabled();
  await search.fill("氷");
  await expect.element(select("氷", "option", "ジュース")).toBeVisible();
  await expect.element(filter(ja.pos_mapping_filter_all, 9)).toBeVisible();
});

it("旧接続の対応は取込操作まで適用せず、取り込んだ対応を下書きへ保存する", async () => {
  const settings = {
    ...posMappingSettingsFixture,
    mappings: [],
    mappingConnectionId: null,
    legacyMappings: {
      connectionId: "tablecast-pos-connection",
      mappings: posMappingSettingsFixture.mappings,
    },
  };
  client.setQueryData(posSettingsOptions("tablecast-store").queryKey, { ...settings, draft: null });
  let saved: unknown;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (
      request.method === "PUT" &&
      new URL(request.url).pathname === "/api/admin/stores/tablecast-store/pos/mappings"
    ) {
      saved = await request.json();
      return Response.json({
        ...posMappingSettingsFixture,
        draft: { ...posMappingSettingsFixture.draft, version: 5 },
      });
    }
    unexpected.push(`${request.method} ${request.url}`);
    return Response.json({}, { status: 500 });
  });
  await renderMappings(settings);
  await expect.element(select("煎茶", "product")).toHaveValue("");
  await expect.element(filter(ja.pos_mapping_filter_unmapped, 9)).toBeVisible();
  expect(saved).toBeUndefined();
  await page.getByRole("button", { name: ja.pos_mapping_legacy_import, exact: true }).click();
  await expect.element(select("煎茶", "product")).toHaveValue("tablecast-square-tea");
  await expect.element(filter(ja.pos_mapping_filter_duplicate, 4)).toBeVisible();
  expect(saved).toBeUndefined();
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(page.getByText(ja.pos_mapping_saved, { exact: true })).toBeVisible();
  const value = posMappingsUpdateSchema.parse(saved);
  expect(value).toMatchObject({
    draftId: "tablecast-pos-draft",
    expectedVersion: 4,
    connectionId: "tablecast-pos-connection",
  });
  expect(value.mappings).toEqual(expect.arrayContaining(posMappingSettingsFixture.mappings));
  expect(value.mappings).toHaveLength(posMappingSettingsFixture.mappings.length);
});

it.each([
  ["維持", "pos_restore_mapping_keep", posMappingSettingsFixture.mappings],
  ["解除", "pos_restore_mapping_clear", []],
] as const)(
  "対応がない旧版の下書きでは現在の対応を%sするか選ぶまで保存しない",
  async (_name, choice, expected) => {
    client.setQueryData(posSettingsOptions("tablecast-store").queryKey, {
      ...posMappingSettingsFixture,
      draft: null,
    });
    const settings = {
      ...posMappingSettingsFixture,
      mappingConnectionId: null,
      mappings: [],
      legacyMappings: null,
    };
    let saved: unknown;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (
        request.method === "PUT" &&
        new URL(request.url).pathname === "/api/admin/stores/tablecast-store/pos/mappings"
      ) {
        saved = await request.json();
        return Response.json({
          ...settings,
          mappingConnectionId: "tablecast-pos-connection",
          mappings: expected,
        });
      }
      unexpected.push(`${request.method} ${request.url}`);
      return Response.json({}, { status: 500 });
    });
    await renderMappings(settings);
    await expect
      .element(page.getByText(ja.pos_restore_mapping_choice, { exact: true }))
      .toBeVisible();
    const save = page.getByRole("button", { name: ja.common_save, exact: true });
    await expect.element(save).toBeDisabled();
    await page.getByRole("button", { name: ja[choice], exact: true }).click();
    await expect.element(save).toBeEnabled();
    expect(saved).toBeUndefined();
    await save.click();
    await expect.element(page.getByText(ja.pos_mapping_saved, { exact: true })).toBeVisible();
    const value = posMappingsUpdateSchema.parse(saved);
    expect(value).toMatchObject({
      draftId: "tablecast-pos-draft",
      expectedVersion: 4,
      connectionId: "tablecast-pos-connection",
    });
    expect(value.mappings).toEqual(expect.arrayContaining([...expected]));
    expect(value.mappings).toHaveLength(expected.length);
  },
);

it("復元元に対応がないとき公開版の取得失敗を示し、再試行と明示選択まで保存を止める", async () => {
  let reads = 0;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (
      request.method === "GET" &&
      new URL(request.url).pathname === "/api/admin/stores/tablecast-store/pos"
    ) {
      reads++;
      return reads === 1
        ? Response.json({ error: { code: "UNAVAILABLE" } }, { status: 500 })
        : Response.json({ ...posMappingSettingsFixture, draft: null });
    }
    unexpected.push(`${request.method} ${request.url}`);
    return Response.json({}, { status: 500 });
  });
  await renderMappings({
    ...posMappingSettingsFixture,
    mappingConnectionId: null,
    mappings: [],
    legacyMappings: null,
  });
  const save = page.getByRole("button", { name: ja.common_save, exact: true });
  await expect.element(page.getByText(ja.common_unavailable, { exact: true })).toBeVisible();
  await expect.element(save).toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: ja.pos_restore_mapping_keep, exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect
    .element(page.getByText(ja.pos_restore_mapping_choice, { exact: true }))
    .toBeVisible();
  await expect.element(save).toBeDisabled();
  await page.getByRole("button", { name: ja.pos_restore_mapping_keep, exact: true }).click();
  await expect.element(save).toBeEnabled();
  await expect.element(select("煎茶", "product")).toHaveValue("tablecast-square-tea");
  expect(reads).toBe(2);
});
