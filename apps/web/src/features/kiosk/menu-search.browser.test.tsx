import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { catalog, product } from "../../test-support/tablecast-fixtures";
import {
  fixture,
  mountKiosk,
  notify,
  requests,
  TablecastSocket,
} from "./test-support/kiosk-fixture";

it("検索ボタンは応答前に入力へfocusし、ページと商品詳細・カートからの復帰を保持する", async () => {
  fixture.current.uiSection = "menu";
  const products = Array.from({ length: 10 }, (_, index) => ({
    ...product,
    id: `tablecast-search-${index}`,
    text: { ...product.text, ja: { ...product.text.ja, displayName: `検索商品${index}` } },
  }));
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products },
  });
  const gate = Promise.withResolvers<void>();
  let waiting = true;
  fixture.beforeRequest = async (request) => {
    if (waiting && request.method === "PATCH" && request.url.includes("/ui")) await gate.promise;
  };
  await mountKiosk();
  const category = catalog.configuration.categories[0];
  if (!category) throw new Error("カテゴリfixtureがありません");
  await page.getByRole("button", { name: category.text.ja.displayName, exact: true }).click();
  try {
    await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
    const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
    await expect.element(input).toHaveFocus();
    expect(fixture.current.menuSearch).toBeNull();
    expect(
      requests.filter((request) => request.method === "PATCH" && request.url.includes("/ui")),
    ).toHaveLength(0);
    await input.fill("検索商品");
    await expect
      .poll(
        () =>
          requests.filter((request) => request.method === "PATCH" && request.url.includes("/ui"))
            .length,
      )
      .toBe(1);
    waiting = false;
    gate.resolve();
    await expect.element(page.getByRole("button", { name: ja.common_next_page })).toBeEnabled();
    await expect.element(input).toHaveFocus();
    await expect
      .poll(() => document.querySelectorAll('[data-theme-part="product-card"]').length)
      .toBe(8);
    await page.getByRole("button", { name: ja.common_next_page }).click();
    await expect.poll(() => fixture.current.menuSearch?.offset).toBe(8);
    await page.getByRole("button", { name: /検索商品9/ }).click();
    const detail = page.getByRole("dialog", { name: "検索商品9", exact: true });
    await expect.element(detail).toBeVisible();
    await detail.getByRole("button", { name: ja.common_close, exact: true }).click();
    await expect.element(page.getByRole("button", { name: /検索商品9/ })).toBeVisible();
    await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
    await page.getByRole("tab", { name: ja.kiosk_menu, exact: true }).click();
    await expect.element(input).toHaveValue("検索商品");
    expect(fixture.current.menuSearch?.offset).toBe(8);
    await page.getByRole("button", { name: ja.common_back, exact: true }).click();
    await expect.poll(() => fixture.current.menuSearch).toBeNull();
    await expect
      .element(page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }))
      .toHaveFocus();
    await expect
      .element(page.getByRole("button", { name: category.text.ja.displayName, exact: true }))
      .toHaveAttribute("aria-pressed", "true");
  } finally {
    waiting = false;
    gate.resolve();
  }
});

it("空欄・空白・IME・Enterでは検索を送らず、前後空白を整えた検索と明示解除だけを送る", async () => {
  fixture.current.uiSection = "menu";
  const writes: unknown[] = [];
  const original = fetch;
  vi.stubGlobal("fetch", async (value: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(value, init);
    if (request.method === "PATCH" && new URL(request.url).pathname === "/api/table/ui")
      writes.push(await request.clone().json());
    return original(value, init);
  });
  await mountKiosk();
  await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
  const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
  await expect.element(input).toHaveFocus();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await input.fill(" \u3000 ");
    input.element().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    input.element().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await input.fill("\u3000");
    input
      .element()
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true }));
    input.element().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    expect(writes).toEqual([]);
    expect(fixture.current.menuSearch).toBeNull();
  } finally {
    vi.useRealTimers();
  }
  await input.fill(`  ${product.text.ja.displayName}\u3000`);
  await expect.poll(() => fixture.current.menuSearch?.query).toBe(product.text.ja.displayName);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await vi.advanceTimersByTimeAsync(1000);
  } finally {
    vi.useRealTimers();
  }
  expect(writes).toEqual([
    { section: "menu", search: { query: product.text.ja.displayName, offset: 0 } },
  ]);
  await page.getByRole("button", { name: ja.kiosk_menu_search_clear }).click();
  await expect.element(input).toHaveValue("");
  await expect.element(input).toHaveFocus();
  await expect.poll(() => fixture.current.menuSearch).toBeNull();
  expect(writes).toEqual([
    { section: "menu", search: { query: product.text.ja.displayName, offset: 0 } },
    { section: "menu", search: null },
  ]);
  await expect
    .element(page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }))
    .toBeVisible();
  await page.getByRole("button", { name: ja.common_back, exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }))
    .toHaveFocus();
  expect(writes).toHaveLength(2);
});

it("初回検索の応答前に戻っても、保留中の検索を明示解除して入力を復活させない", async () => {
  fixture.current.uiSection = "menu";
  const release = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();
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
  await input.fill(product.text.ja.displayName);
  const back = page.getByRole("button", { name: ja.common_back, exact: true }).element();
  try {
    // 親の楽観描画を待たず、同じ処理内で送信直後に戻る。
    input.element().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    back.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await reached.promise;
    await expect.element(input).not.toBeInTheDocument();
    release.resolve();
    await expect.poll(() => fixture.client.isMutating()).toBe(0);
    expect(writes).toEqual([
      { section: "menu", search: { query: product.text.ja.displayName, offset: 0 } },
      { section: "menu", search: null },
    ]);
    expect(fixture.current.menuSearch).toBeNull();
    await expect
      .element(page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }))
      .toHaveFocus();
  } finally {
    release.resolve();
  }
});

it("IME確定後の検索と0件を表示し、失敗後も入力と直前の結果から再試行できる", async () => {
  fixture.current.uiSection = "menu";
  await mountKiosk();
  await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
  const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
  await expect.element(input).toHaveFocus();
  input.element().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  await input.fill("zxqv未登録");
  expect(fixture.current.menuSearch).toBeNull();
  input
    .element()
    .dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "zxqv未登録" }));
  await expect.element(page.getByText(ja.kiosk_menu_search_empty)).toBeVisible();
  const original = fetch;
  let fail = true;
  vi.stubGlobal("fetch", async (value: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(value, init);
    if (fail && request.method === "PATCH" && request.url.includes("/ui"))
      return Response.json({ error: { code: "TEST_UNAVAILABLE" } }, { status: 503 });
    return original(value, init);
  });
  await input.fill(product.text.ja.displayName);
  await expect
    .element(page.getByRole("button", { name: ja.common_retry, exact: true }))
    .toBeVisible();
  await expect.element(input).toHaveValue(product.text.ja.displayName);
  fail = false;
  await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }))
    .toBeVisible();
});

it.each(["クリア", "戻る"])(
  "%sの検索解除が失敗しても、空欄から明示解除を再試行できる",
  async (action) => {
    fixture.current.uiSection = "menu";
    fixture.current.menuSearch = {
      query: product.text.ja.displayName,
      offset: 0,
      total: 1,
      more: false,
      productIds: [product.id],
    };
    const original = fetch;
    let fail = true;
    const writes: unknown[] = [];
    vi.stubGlobal("fetch", async (value: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(value, init);
      if (request.method === "PATCH" && new URL(request.url).pathname === "/api/table/ui") {
        writes.push(await request.clone().json());
        if (fail) return Response.json({ error: { code: "TEST_UNAVAILABLE" } }, { status: 503 });
      }
      return original(value, init);
    });
    await mountKiosk();
    await page
      .getByRole("button", {
        name: action === "クリア" ? ja.kiosk_menu_search_clear : ja.common_back,
        exact: true,
      })
      .click();
    const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
    await expect.element(input).toHaveValue("");
    await expect
      .element(page.getByRole("button", { name: ja.common_retry, exact: true }))
      .toBeVisible();
    const failure = page.getByRole("alert").filter({ hasText: ja.common_unavailable });
    expect(failure.elements()).toHaveLength(1);
    expect(fixture.current.menuSearch?.query).toBe(product.text.ja.displayName);
    fail = false;
    await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
    await expect.poll(() => fixture.client.isMutating()).toBe(0);
    await fixture.client.invalidateQueries({ queryKey: ["tablecast-table"], exact: true });
    expect(fixture.current.menuSearch).toBeNull();
    expect(writes).toEqual([
      { section: "menu", search: null },
      { section: "menu", search: null },
    ]);
    await expect.element(failure).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }))
      .toBeVisible();
  },
);

it("音声の検索通知は同じID順を表示し、入力へfocusせず未送信の検索を取り消す", async () => {
  fixture.current.uiSection = "menu";
  await mountKiosk();
  await expect.poll(() => TablecastSocket.instances.length).toBeGreaterThan(0);
  TablecastSocket.instances.at(-1)?.dispatchEvent(new Event("open"));
  const ids = catalog.configuration.products.map((item) => item.id).toReversed();
  fixture.current.menuSearch = {
    query: "音声の検索",
    offset: 0,
    productIds: ids,
    total: ids.length,
    more: false,
  };
  notify("table.ui");
  const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
  await expect.element(input).toHaveValue("音声の検索");
  await expect.element(input).not.toHaveFocus();
  expect(
    [...document.querySelectorAll('[data-theme-part="product-card"] strong')].map(
      (node) => node.textContent,
    ),
  ).toEqual(
    ids.map(
      (id) => catalog.configuration.products.find((item) => item.id === id)?.text.ja.displayName,
    ),
  );
  await input.fill("ページ移動前の未送信入力");
  fixture.current.menuSearch = {
    ...fixture.current.menuSearch,
    offset: 8,
    total: ids.length + 8,
  };
  notify("table.ui");
  await expect.element(input).toHaveValue("音声の検索");
  await input.fill("未送信の入力");
  fixture.current.menuSearch = {
    ...fixture.current.menuSearch,
    query: "新しい音声検索",
    productIds: [],
  };
  notify("table.ui");
  await expect.element(input).toHaveValue("新しい音声検索");
  expect(fixture.current.menuSearch.query).toBe("新しい音声検索");
});

it("卓状態の再取得中に外部の検索ページが変わっても、新しい通知で再取得して古いページへ戻らない", async () => {
  fixture.current.uiSection = "menu";
  const products = Array.from({ length: 10 }, (_, index) => ({
    ...product,
    id: `tablecast-overlap-${index}`,
    text: { ...product.text, ja: { ...product.text.ja, displayName: `重なった検索商品${index}` } },
  }));
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products },
  });
  fixture.current.menuSearch = {
    query: "検索商品",
    offset: 0,
    total: 10,
    more: true,
    productIds: products.slice(0, 8).map((item) => item.id),
  };
  await mountKiosk();
  await expect.poll(() => TablecastSocket.instances.length).toBeGreaterThan(0);
  TablecastSocket.instances.at(-1)?.dispatchEvent(new Event("open"));
  const original = fetch;
  const reached = Promise.withResolvers<Request>();
  const release = Promise.withResolvers<void>();
  let hold = true;
  vi.stubGlobal("fetch", async (value: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(value, init);
    const response = await original(value, init);
    if (hold && request.method === "GET" && new URL(request.url).pathname === "/api/table") {
      hold = false;
      reached.resolve(request);
      await release.promise;
    }
    return response;
  });
  const pending = fixture.client.invalidateQueries(
    { queryKey: ["tablecast-table"], exact: true },
    { cancelRefetch: false },
  );
  try {
    const previousRequest = await reached.promise;
    fixture.current.menuSearch = {
      query: "検索商品",
      offset: 8,
      total: 10,
      more: false,
      productIds: products.slice(8).map((item) => item.id),
    };
    notify("table.ui");
    await expect
      .poll(
        () =>
          fixture.client.getQueryData<{ menuSearch: { offset: number } }>(["tablecast-table"])
            ?.menuSearch.offset,
      )
      .toBe(8);
    expect(previousRequest.signal.aborted).toBe(true);
    release.resolve();
    await pending;
    await expect.element(page.getByRole("button", { name: /重なった検索商品9/ })).toBeVisible();
    expect(fixture.current.menuSearch.offset).toBe(8);
    expect(
      requests.filter(
        (request) =>
          request.method === "PATCH" && new URL(request.url).pathname === "/api/table/ui",
      ),
    ).toHaveLength(0);
  } finally {
    release.resolve();
    await pending;
  }
});

it("古い検索応答が音声で表示した新しい検索語と結果を巻き戻さない", async () => {
  fixture.current.uiSection = "menu";
  await mountKiosk();
  await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
  await expect
    .element(page.getByRole("searchbox", { name: ja.kiosk_menu_search_label }))
    .toHaveFocus();
  await expect.poll(() => TablecastSocket.instances.length).toBeGreaterThan(0);
  TablecastSocket.instances.at(-1)?.dispatchEvent(new Event("open"));
  const original = fetch;
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  vi.stubGlobal("fetch", async (value: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(value, init);
    const request = new Request(value, init);
    if (request.method === "PATCH" && request.url.includes("/ui")) {
      reached.resolve();
      await release.promise;
    }
    return response;
  });
  const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
  try {
    await input.fill("古い検索");
    await reached.promise;
    fixture.current.menuSearch = {
      query: "音声の新しい検索",
      offset: 0,
      total: 1,
      more: false,
      productIds: [product.id],
    };
    notify("table.ui");
    const cursor = fixture.current.cursor;
    await expect
      .poll(() => fixture.client.getQueryData<{ cursor: number }>(["tablecast-table"])?.cursor)
      .toBe(cursor);
    release.resolve();
    await expect.element(input).toHaveValue("音声の新しい検索");
    await expect
      .element(page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }))
      .toBeVisible();
  } finally {
    release.resolve();
  }
});

it("卓snapshotと通知接続の間に検索が変わっても、初回同期で結果を回復する", async () => {
  fixture.current.uiSection = "menu";
  let changed = false;
  fixture.beforeRequest = async (request) => {
    const url = new URL(request.url);
    if (changed || url.pathname !== "/api/table/events" || !url.searchParams.has("tail")) return;
    changed = true;
    fixture.current.menuSearch = {
      query: "接続前の検索",
      offset: 0,
      total: 1,
      more: false,
      productIds: [product.id],
    };
    fixture.current.cursor += 1;
    fixture.current.events.push({
      cursor: fixture.current.cursor,
      storeId: fixture.current.storeId,
      tableSessionId: fixture.current.id,
      kind: "table.ui",
      data: {},
      createdAt: Date.now(),
    });
  };
  await mountKiosk();
  await expect.poll(() => TablecastSocket.instances.length).toBeGreaterThan(0);
  TablecastSocket.instances.at(-1)?.dispatchEvent(new Event("open"));
  await expect
    .element(page.getByRole("searchbox", { name: ja.kiosk_menu_search_label }))
    .toHaveValue("接続前の検索");
  await expect
    .element(page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }))
    .toBeVisible();
});
