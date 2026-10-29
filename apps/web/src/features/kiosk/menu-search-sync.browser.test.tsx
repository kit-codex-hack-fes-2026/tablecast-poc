import { coreStateSchema, uiSectionInputSchema } from "@tablecast/api/schema";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect } from "react";
import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { catalog, product } from "../../test-support/tablecast-fixtures";
import { tableCatalogOptions, tableOptions } from "./table-query";
import { fixture, mountKiosk } from "./test-support/kiosk-fixture";

function AdvanceDebounceOnSync({ cursor, onAdvance }: { cursor: number; onAdvance: () => void }) {
  const { data } = useQuery(tableOptions(fixture.client));
  useEffect(() => {
    if (data?.cursor !== cursor) return;
    onAdvance();
    // 外部snapshotを描画し、同期effectのstate更新をcommitする前に入力の期限へ進める。
    vi.advanceTimersByTime(250);
  }, [cursor, data?.cursor, onAdvance]);
  return null;
}

function AdvanceDebounceBeforeEffects({
  cursor,
  onAdvance,
}: {
  cursor: number;
  onAdvance: () => void;
}) {
  const { data } = useQuery(tableOptions(fixture.client));
  useLayoutEffect(() => {
    if (data?.cursor !== cursor) return;
    onAdvance();
    // 新しい版のcommit直後、同期effectが未送信入力を取り消す前に既存timerを期限へ進める。
    vi.advanceTimersByTime(250);
  }, [cursor, data?.cursor, onAdvance]);
  return null;
}

it("外部検索の同期中に入力の期限が来ても、旧検索と新検索を先頭ページへ書き戻さない", async () => {
  fixture.current.uiSection = "menu";
  const products = Array.from({ length: 16 }, (_, index) => ({
    ...product,
    id: `tablecast-draft-race-${index}`,
    text: { ...product.text, ja: { ...product.text.ja, displayName: `検索商品${index}` } },
  }));
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products },
  });
  const first = products[0];
  if (!first) throw new Error("検索商品の先頭がありません");
  fixture.current.menuSearch = {
    query: "検索商品0",
    offset: 0,
    total: 1,
    more: false,
    productIds: [first.id],
  };
  const cursor = fixture.current.cursor + 1;
  const advanced = vi.fn<() => void>();
  await mountKiosk(<AdvanceDebounceOnSync cursor={cursor} onAdvance={advanced} />);
  await expect.poll(() => fixture.client.isFetching()).toBe(0);
  const writes: unknown[] = [];
  fixture.beforeRequest = async (request) => {
    if (request.method === "PATCH" && new URL(request.url).pathname === "/api/table/ui")
      writes.push(await request.clone().json());
  };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    fixture.current.menuSearch = {
      query: "検索商品",
      offset: 8,
      total: 16,
      more: false,
      productIds: products.slice(8).map((item) => item.id),
    };
    fixture.current.cursor = cursor;
    fixture.client.setQueryData(["tablecast-table"], coreStateSchema.parse(fixture.current));
    await vi.advanceTimersByTimeAsync(0);
    await expect.poll(() => advanced.mock.calls.length).toBe(1);
    await expect.poll(() => fixture.client.isMutating()).toBe(0);
    await vi.advanceTimersByTimeAsync(300);
    await expect.poll(() => fixture.client.isMutating()).toBe(0);
    expect(writes).toEqual([]);
    expect(fixture.current.menuSearch.offset).toBe(8);
    await expect
      .element(page.getByRole("searchbox", { name: ja.kiosk_menu_search_label }))
      .toHaveValue("検索商品");
    expect(
      [...document.querySelectorAll('[data-theme-part="product-card"] strong')].map(
        (node) => node.textContent,
      ),
    ).toEqual(products.slice(8).map((item) => item.text.ja.displayName));
  } finally {
    vi.useRealTimers();
  }
});

it("カタログ版のcommit直後に期限が来ても、旧版で編集中の検索を送信しない", async () => {
  fixture.current.uiSection = "menu";
  fixture.current.menuSearch = {
    query: product.text.ja.displayName,
    offset: 0,
    total: 1,
    more: false,
    productIds: [product.id],
  };
  const cursor = fixture.current.cursor + 1;
  const advanced = vi.fn<() => void>();
  await mountKiosk(<AdvanceDebounceBeforeEffects cursor={cursor} onAdvance={advanced} />);
  await expect.poll(() => fixture.client.isFetching()).toBe(0);
  const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
  const writes: unknown[] = [];
  fixture.beforeRequest = async (request) => {
    if (request.method !== "PATCH" || new URL(request.url).pathname !== "/api/table/ui") return;
    const body = uiSectionInputSchema.parse(await request.clone().json());
    if (body.search !== undefined) writes.push(body);
  };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await input.fill("旧版で編集中の検索");
    const nextCatalog = {
      ...catalog,
      version: catalog.version + 1,
      imageAssets: catalog.imageAssets ?? {},
    };
    fixture.catalogResponse = Response.json(nextCatalog);
    fixture.client.setQueryData(
      tableCatalogOptions(fixture.current.storeId, nextCatalog.version).queryKey,
      nextCatalog,
    );
    fixture.current.configVersion = nextCatalog.version;
    fixture.current.cursor = cursor;
    fixture.client.setQueryData(["tablecast-table"], coreStateSchema.parse(fixture.current));
    await vi.advanceTimersByTimeAsync(0);
    await expect.poll(() => advanced.mock.calls.length).toBe(1);
    await expect.poll(() => fixture.client.isMutating()).toBe(0);
    expect(writes).toEqual([]);
    await expect.element(input).toHaveValue(product.text.ja.displayName);
  } finally {
    vi.useRealTimers();
  }
});

it("自分の検索応答を待つ間の追加入力を保持し、その入力を次の検索として送信する", async () => {
  fixture.current.uiSection = "menu";
  const firstQuery = product.text.ja.displayName.slice(0, -1);
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writes: unknown[] = [];
  fixture.beforeRequest = async (request) => {
    if (request.method !== "PATCH" || new URL(request.url).pathname !== "/api/table/ui") return;
    writes.push(await request.clone().json());
    if (writes.length === 1) {
      reached.resolve();
      await release.promise;
    }
  };
  await mountKiosk();
  await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
  const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
  try {
    await input.fill(firstQuery);
    await reached.promise;
    await input.fill(product.text.ja.displayName);
    release.resolve();
    await expect.poll(() => fixture.current.menuSearch?.query).toBe(product.text.ja.displayName);
    await expect.element(input).toHaveValue(product.text.ja.displayName);
    await expect.element(input).toHaveFocus();
    await expect
      .element(page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }))
      .toBeVisible();
    expect(writes).toEqual([
      { section: "menu", search: { query: firstQuery, offset: 0 } },
      { section: "menu", search: { query: product.text.ja.displayName, offset: 0 } },
    ]);
  } finally {
    release.resolve();
  }
});
