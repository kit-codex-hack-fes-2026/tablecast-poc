import { resolveLocalized } from "@tablecast/api/localization";
import { QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { catalog, product } from "../../test-support/tablecast-fixtures";
import "../../styles.css";
import { Kiosk } from "./kiosk";
import {
  fixture,
  mountKiosk,
  notify,
  requests,
  Subscription,
  TablecastSocket,
} from "./test-support/kiosk-fixture";

it("店舗切替で旧取得を中断し、遅い旧店舗の通知を新店舗へ伝えない", async () => {
  const changed = vi.fn<() => void>();
  const reached = Promise.withResolvers<Request>();
  const release = Promise.withResolvers<Response>();
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.includes("/tablecast-old/events")) {
      reached.resolve(request);
      return release.promise;
    }
    return Response.json({ cursor: 20, events: [] });
  });
  const screen = await render(<Subscription storeId="tablecast-old" onChange={changed} />);
  const oldSocket = TablecastSocket.instances[0];
  if (!oldSocket) throw new Error("旧店舗の接続がありません");
  oldSocket.dispatchEvent(new Event("open"));
  const oldRequest = await reached.promise;
  try {
    await screen.rerender(<Subscription storeId="tablecast-new" onChange={changed} />);
    expect(oldRequest.signal.aborted).toBe(true);
    expect(oldSocket.closed).toBe(true);
    {
      release.resolve(Response.json({ cursor: 99, events: [{ kind: "table.ui" }] }));
      await release.promise;
    }
    await screen.rerender(<Subscription storeId="tablecast-new" onChange={changed} />);
    expect(changed).not.toHaveBeenCalled();
    const latest = TablecastSocket.instances.at(-1);
    if (!latest) throw new Error("新店舗の接続がありません");
    latest.dispatchEvent(new Event("open"));
    await expect
      .element(page.getByRole("status", { name: "接続状態" }))
      .toMatchTextContent("接続済み");
    const lastRequest = requests.at(-1);
    if (!lastRequest) throw new Error("新店舗の要求がありません");
    expect(new URL(lastRequest.url).searchParams.get("after")).toBe("10");
  } finally {
    release.resolve(Response.json({ cursor: 10, events: [] }));
  }
});

it("切断の再接続を一度予約し、unmount後は再接続もpollも開始しない", async () => {
  vi.useFakeTimers();
  const screen = await render(
    <Subscription storeId="tablecast-store" onChange={vi.fn<() => void>()} />,
  );
  const socket = TablecastSocket.instances[0];
  if (!socket) throw new Error("店舗の接続がありません");
  socket.close();
  await vi.advanceTimersByTimeAsync(2999);
  expect(TablecastSocket.instances).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(TablecastSocket.instances).toHaveLength(2);
  await screen.unmount();
  const before = requests.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(TablecastSocket.instances).toHaveLength(2);
  expect(requests).toHaveLength(before);
  expect(TablecastSocket.instances.every((item) => item.closed)).toBe(true);
});

it("日本語の商品0件でも店員を呼べる", async () => {
  const locale = "ja";
  const labels = ja;
  fixture.current.locale = locale;
  fixture.current.uiSection = "menu";
  fixture.current.staffCalled = false;
  fixture.current.cart = { ...fixture.current.cart, lines: [], total: 0 };
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products: [], categories: [] },
  });
  await page.viewport(1280, 800);
  await render(
    <LocaleProvider initialLocale={locale} persist={false}>
      <QueryClientProvider client={fixture.client}>
        <MotionProvider>
          <Kiosk />
        </MotionProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  await expect.element(page.getByText(labels.kiosk_menu_empty)).toBeVisible();

  await page.getByRole("button", { name: labels.kiosk_call_staff, exact: true }).click();
  const assistance = page.getByRole("dialog", { name: labels.assistance_title });
  await assistance.getByRole("button", { name: labels.assistance_direct, exact: true }).click();
  await expect
    .element(assistance.getByRole("button", { name: labels.assistance_pending, exact: true }))
    .toBeDisabled();
  expect(
    requests.filter(
      (request) =>
        request.method === "POST" && new URL(request.url).pathname.endsWith("/table/call"),
    ),
  ).toHaveLength(1);
});

it("日本語の商品取得失敗は空状態にせず再試行できる", async () => {
  const locale = "ja";
  const labels = ja;
  fixture.current.locale = locale;
  fixture.current.uiSection = "menu";
  fixture.catalogResponse = Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
  await render(
    <LocaleProvider initialLocale={locale} persist={false}>
      <QueryClientProvider client={fixture.client}>
        <MotionProvider>
          <Kiosk />
        </MotionProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  const catalogError = page.getByRole("alert").filter({ hasText: labels.common_unavailable });
  const microphoneError = page
    .getByRole("alert")
    .filter({ hasText: labels.kiosk_microphone_error_empty });
  await expect.element(catalogError).toBeVisible();
  await expect.element(microphoneError).toBeVisible();
  await expect.element(page.getByText(labels.kiosk_menu_empty)).not.toBeInTheDocument();
  await expect.element(page.getByText(labels.kiosk_category_empty)).not.toBeInTheDocument();
  fixture.catalogResponse = Response.json(catalog);
  await page.getByRole("button", { name: labels.common_retry, exact: true }).click();
  await expect
    .element(
      page.getByRole("button", {
        name: new RegExp(resolveLocalized(product.text, locale).displayName),
      }),
    )
    .toBeEnabled();
  await expect.element(catalogError).not.toBeInTheDocument();
  await expect.element(microphoneError).toBeVisible();
});

it.each(["ja", "en"] as const)(
  "%sの音声ツールによる画面通知で商品詳細・カート・一覧へ遷移し、画面操作や注文確定を要しない",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    fixture.current.locale = locale;
    fixture.current.uiSection = "menu";
    fixture.current.selectedProductId = null;
    await page.viewport(1180, 820);
    const screen = await mountKiosk();
    await expect
      .element(screen.getByRole("tab", { name: labels.kiosk_menu, exact: true }))
      .toBeVisible();
    await expect.poll(() => TablecastSocket.instances.length).toBeGreaterThan(0);
    TablecastSocket.instances.at(-1)?.dispatchEvent(new Event("open"));
    const previous = structuredClone(fixture.current.cart);
    fixture.current.selectedProductId = product.id;
    notify("table.ui");
    await expect
      .element(
        screen.getByRole("heading", {
          name: new RegExp(resolveLocalized(product.text, locale).displayName),
        }),
      )
      .toBeVisible();
    fixture.current.uiSection = "cart";
    fixture.current.selectedProductId = null;
    notify("table.ui");
    await expect.poll(() => document.querySelector('[data-ui="product-detail"]')).toBeNull();
    await expect
      .element(screen.getByRole("tab", { name: new RegExp(labels.kiosk_cart) }))
      .toHaveAttribute("aria-selected", "true");
    fixture.current.uiSection = "menu";
    notify("table.ui");
    await expect
      .element(screen.getByRole("tab", { name: labels.kiosk_menu, exact: true }))
      .toHaveAttribute("aria-selected", "true");
    expect(fixture.current.cart).toEqual(previous);
  },
);

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
    await expect.element(input).toHaveValue("");
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

it("IME確定後の検索と0件を表示し、失敗後も入力と直前の結果から再試行できる", async () => {
  fixture.current.uiSection = "menu";
  await mountKiosk();
  await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
  await expect
    .poll(() => fixture.current.menuSearch?.total)
    .toBe(catalog.configuration.products.length);
  const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
  input.element().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  await input.fill("zxqv未登録");
  expect(fixture.current.menuSearch?.query).toBe("");
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

it("古い検索応答が音声で表示した新しい検索語と結果を巻き戻さない", async () => {
  fixture.current.uiSection = "menu";
  await mountKiosk();
  await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
  await expect.poll(() => fixture.current.menuSearch?.query).toBe("");
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

it("画面操作のcursorが先へ進んでも、受信途中の会話履歴を捨てない", async () => {
  fixture.current.uiSection = "menu";
  const original = fetch;
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let pause = true;
  const cursor = fixture.current.cursor + 1;
  vi.stubGlobal("fetch", async (value: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(value, init);
    const url = new URL(request.url);
    if (pause && url.pathname === "/api/table/events" && !url.searchParams.has("tail")) {
      pause = false;
      reached.resolve();
      await release.promise;
      return Response.json({
        cursor,
        events: [
          {
            cursor,
            storeId: fixture.current.storeId,
            tableSessionId: fixture.current.id,
            kind: "voice.assistant",
            createdAt: Date.now(),
            data: { role: "assistant", locale: "ja", text: "接続待ちの会話" },
          },
        ],
      });
    }
    return original(value, init);
  });
  await mountKiosk();
  await expect.poll(() => TablecastSocket.instances.length).toBeGreaterThan(0);
  TablecastSocket.instances.at(-1)?.dispatchEvent(new Event("open"));
  try {
    await reached.promise;
    fixture.current.cursor = cursor;
    await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
    await expect
      .poll(() => fixture.client.getQueryData<{ cursor: number }>(["tablecast-table"])?.cursor)
      .toBe(cursor + 1);
    release.resolve();
    await expect.element(page.getByText("接続待ちの会話", { exact: true })).toBeVisible();
  } finally {
    release.resolve();
  }
});
