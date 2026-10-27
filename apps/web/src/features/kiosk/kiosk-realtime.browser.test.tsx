import { QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
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
  await expect
    .element(page.getByRole("button", { name: labels.kiosk_called_staff, exact: true }))
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
        name: new RegExp(product.text[locale].displayName),
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
      .element(screen.getByRole("heading", { name: product.text[locale].displayName, exact: true }))
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
