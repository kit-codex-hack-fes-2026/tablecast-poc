import { cleanup, render } from "vitest-browser-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page, server, userEvent } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cartUpdateSchema,
  uiSectionInputSchema,
  type CartUpdate,
  type TableState,
} from "@tablecast/api/schema";
import { catalog, product, table } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { useRealtime } from "../../lib/use-realtime";
import { Kiosk } from "./kiosk";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import "../../styles.css";

// 接続先だけを差し替える。hook、QueryClient、HTTP client、画面は本番実装を使う。
class TablecastSocket extends EventTarget {
  static instances: TablecastSocket[] = [];
  closed = false;
  constructor(readonly url: string) {
    super();
    TablecastSocket.instances.push(this);
  }
  close() {
    this.closed = true;
    this.dispatchEvent(new Event("close"));
  }
}

let catalogResponse: Response;
let client: QueryClient;
let current: TableState;
let unexpected: string[];
let cartFailure: number;
let savedCart: TableState["cart"];
let confirmationDuration: number;
const cartWrites: CartUpdate[] = [];
const requests: Request[] = [];
let initialViewport: { width: number; height: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
  vi.stubGlobal("WebSocket", TablecastSocket);
  TablecastSocket.instances = [];
  catalogResponse = Response.json(catalog);
  current = structuredClone(table);
  current.uiSection = "cart";
  current.voiceState = "stopped";
  current.voiceSessionId = null;
  unexpected = [];
  requests.length = 0;
  cartWrites.length = 0;
  cartFailure = 0;
  confirmationDuration = 60_000;
  savedCart = structuredClone(table.cart);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/api/table/participants")
        return Response.json({ participants: [], context: null });
      if (request.method === "POST" && path === "/api/table/customer-code")
        return Response.json({
          code: "a".repeat(64),
          expiresAt: Date.now() + 300000,
          url: `${window.location.origin}/member/join?code=${"a".repeat(64)}`,
        });
      if (request.method === "GET" && path === "/api/table") return Response.json(current);
      if (request.method === "GET" && path === "/api/table/catalog") return catalogResponse.clone();
      if (request.method === "GET" && path.endsWith("/events")) {
        const after = Number(new URL(request.url).searchParams.get("after"));
        return Response.json({
          cursor: current.cursor,
          events: current.events.filter((event) => event.cursor > after),
        });
      }
      if (request.method === "PUT" && path === "/api/table/cart") {
        cartWrites.push(cartUpdateSchema.parse(await request.json()));
        if (cartFailure)
          return Response.json({ error: { code: "CART_CONFLICT" } }, { status: cartFailure });
        current = { ...current, cursor: current.cursor + 1, cart: savedCart, snapshot: null };
        return Response.json(current);
      }
      if (request.method === "POST" && path === "/api/table/call") {
        current = { ...current, staffCalled: true, cursor: current.cursor + 1 };
        return Response.json(current);
      }
      if (request.method === "POST" && path === "/api/table/confirm") {
        current.snapshot = {
          id: "tablecast-confirmation",
          tableSessionId: current.id,
          cartVersion: current.cart.version,
          configVersion: current.configVersion,
          lines: current.cart.lines,
          total: current.cart.total,
          locale: current.locale,
          text: "注文内容",
          expiresAt: Date.now() + confirmationDuration,
          channel: "gui",
          status: "pending",
          createdTurnId: null,
          plan: null,
        };
        return Response.json(current.snapshot);
      }
      if (request.method === "PATCH" && path === "/api/table/ui") {
        const screenInput = uiSectionInputSchema.parse(await request.json());
        current = {
          ...current,
          uiSection: screenInput.section,
          selectedProductId: screenInput.productId ?? null,
          cursor: current.cursor + 1,
        };
        return Response.json(current);
      }
      if (request.method === "POST" && path === "/api/table/voice/stop")
        return Response.json({ ok: true });
      if (request.method === "POST" && path === "/api/table/voice/start") {
        return Response.json({ error: { code: "VOICE_NOT_CONFIGURED" } }, { status: 503 });
      }
      unexpected.push(`${request.method} ${path}`);
      return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST" } }, { status: 500 });
    }),
  );
});
afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.trim().split("=")[0];
      if (name.startsWith("tablecast-layout-")) document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
    if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

async function mountKiosk() {
  return render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <QueryClientProvider client={client}>
        <Kiosk />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

function notify(kind: "cart.updated" | "configuration.published") {
  current.cursor += 1;
  current.events.push({
    cursor: current.cursor,
    storeId: current.storeId,
    tableSessionId: kind === "configuration.published" ? null : current.id,
    kind,
    data: {},
    createdAt: Date.now(),
  });
  const socket = TablecastSocket.instances.at(-1);
  if (!socket) throw new Error("卓の通知接続がありません");
  socket.dispatchEvent(new MessageEvent("message", { data: "changed" }));
}

it("未充足行の修正は競合後も選択を保持し、再送でも同じ行だけを更新する", async () => {
  await page.viewport(1280, 1000);
  const conditional = structuredClone(product);
  conditional.modifiers[0].kind = "multiple";
  conditional.modifiers[0].min = 0;
  conditional.modifiers[0].max = 2;
  const [first, required] = conditional.modifiers[0].options;
  if (!first || !required) throw new Error("条件付き選択肢が必要です");
  first.conditions = {
    version: 2,
    requires: { kind: "option", optionId: required.id },
    excludes: null,
  };
  catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products: [conditional] },
  });
  const line = current.cart.lines[0];
  if (!line) throw new Error("未充足行が必要です");
  line.selections = [{ optionId: first.id, quantity: 1 }];
  line.conditionIssues = [{ optionId: first.id, relation: "requires" }];
  current.cart.complete = false;
  savedCart = {
    ...structuredClone(current.cart),
    version: current.cart.version + 1,
    complete: true,
    lines: [
      {
        ...line,
        conditionIssues: [],
        selections: [...line.selections, { optionId: required.id, quantity: 1 }],
      },
    ],
  };
  await mountKiosk();
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_review, exact: true }))
    .toBeDisabled();
  await page.getByRole("button", { name: ja.kiosk_edit, exact: true }).click();
  const detail = page.getByRole("region", { name: product.text.ja.displayName, exact: true });
  const choice = detail.getByRole("checkbox", { name: required.text.ja.displayName, exact: true });
  await choice.click();
  cartFailure = 409;
  await detail.getByRole("button", { name: ja.common_update, exact: true }).click();
  await expect.element(detail.getByRole("alert")).toBeVisible();
  await expect.element(choice).toBeChecked();
  expect(current.cart.complete).toBe(false);
  cartFailure = 0;
  await detail.getByRole("button", { name: ja.common_update, exact: true }).click();
  await expect.element(detail).not.toBeInTheDocument();
  expect(cartWrites).toEqual(
    [1, 2].map(() => ({
      expectedVersion: table.cart.version,
      lines: [
        {
          id: line.id,
          productId: product.id,
          quantity: 1,
          selections: savedCart.lines[0].selections,
        },
      ],
    })),
  );
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_review, exact: true }))
    .toBeEnabled();
});

it.each(["期限", "カート版", "公開版"] as const)(
  "確認の%sが失効したら確定操作を閉じる",
  async (reason) => {
    await page.viewport(1280, 1000);
    await mountKiosk();
    if (reason === "期限") confirmationDuration = 2000;
    await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
    const confirmation = page.getByRole("region", { name: ja.kiosk_review_title, exact: true });
    await expect.element(confirmation).toBeVisible();
    // 期限は確認APIが返した値を実タイマーで観測し、Reactや通信の時計は置き換えない。
    if (reason !== "期限") {
      if (reason === "カート版") current.cart.version += 1;
      else {
        current.configVersion += 1;
        if (current.snapshot) current.snapshot.status = "invalid";
        catalogResponse = Response.json({ ...catalog, version: current.configVersion });
      }
      notify(reason === "公開版" ? "configuration.published" : "cart.updated");
    }
    await expect.element(confirmation).not.toBeInTheDocument();
    expect(requests.some((request) => new URL(request.url).pathname === "/api/table/orders")).toBe(
      false,
    );
  },
);

it("公開通知で開いた商品を閉じて新価格を取得し、同じ通知でもカート行を重複しない", async () => {
  await page.viewport(1280, 1000);
  current.uiSection = "menu";
  await mountKiosk();
  await page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }).click();
  const detail = page.getByRole("region", { name: product.text.ja.displayName, exact: true });
  await expect.element(detail).toBeVisible();
  current.configVersion += 1;
  catalogResponse = Response.json({
    ...catalog,
    version: current.configVersion,
    configuration: { ...catalog.configuration, products: [{ ...product, price: 980 }] },
  });
  notify("configuration.published");
  await expect.element(detail).not.toBeInTheDocument();
  const card = page.getByRole("button", { name: new RegExp(product.text.ja.displayName) });
  await expect.element(card).toHaveTextContent("980");
  await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
  const socket = TablecastSocket.instances.at(-1);
  if (!socket) throw new Error("卓の通知接続がありません");
  socket.dispatchEvent(new MessageEvent("message", { data: "changed" }));
  await expect
    .element(page.getByRole("tabpanel").getByText(current.cart.lines[0].name.ja, { exact: true }))
    .toBeVisible();
  expect(client.getQueryData<TableState>(["tablecast-table"])?.cart.lines).toHaveLength(1);
});

const orderPanel = () => document.getElementById("tablecast-order");
it("注文ペインの比率をCookieから復元し、縦横の切替でもタブと音声停止を保持する", async () => {
  await page.viewport(1024, 768);
  const screen = await mountKiosk();
  const handle = page.getByRole("separator", { name: ja.kiosk_resize_panes });
  await expect.element(handle).toBeVisible();
  const initial = orderPanel()?.getBoundingClientRect().width ?? 0;
  handle.element().focus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect
    .poll(() => orderPanel()?.getBoundingClientRect().width ?? 0)
    .toBeGreaterThan(initial + 10);
  const adjusted = orderPanel()?.getBoundingClientRect().width ?? 0;
  await expect.poll(() => document.cookie).toContain("tablecast-layout-");
  await page.viewport(390, 844);
  await expect.element(handle).toHaveAttribute("aria-orientation", "horizontal");
  const initialHeight = orderPanel()?.getBoundingClientRect().height ?? 0;
  handle.element().focus();
  await userEvent.keyboard("{ArrowUp}");
  await expect
    .poll(() => orderPanel()?.getBoundingClientRect().height ?? 0)
    .toBeGreaterThan(initialHeight + 10);
  await expect
    .element(page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }))
    .toHaveAttribute("aria-selected", "true");
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_voice_resume, exact: true }))
    .toBeVisible();
  await page.viewport(1024, 768);
  await expect.element(handle).toHaveAttribute("aria-orientation", "vertical");
  const desktop = orderPanel()?.getBoundingClientRect().width ?? adjusted;
  await screen.unmount();
  await mountKiosk();
  await expect
    .poll(() => Math.abs((orderPanel()?.getBoundingClientRect().width ?? 0) - desktop))
    .toBeLessThan(2);
});

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeの文字を2倍にしても縦横画面で音声操作と注文確認を利用できる",
  async ({ locale, labels }) => {
    current.locale = locale;
    await page.viewport(1024, 768);
    const screen = await render(
      <LocaleProvider initialLocale={locale} persist={false}>
        <QueryClientProvider client={client}>
          <Kiosk />
        </QueryClientProvider>
      </LocaleProvider>,
    );
    const review = screen.getByRole("button", { name: labels.kiosk_review, exact: true });
    await expect.element(review).toBeEnabled();
    // 実機zoomとは区別し、固定pxを含む各テキストのcomputed sizeを2倍にする。
    const sizes = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) =>
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        ),
      )
      .map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }));
    for (const { element, size } of sizes) element.style.fontSize = `${size * 2}px`;
    for (const [width, height] of [
      [1024, 768],
      [768, 1024],
    ]) {
      await page.viewport(width, height);
      for (const locator of [
        review,
        screen.getByRole("button", { name: labels.kiosk_voice_resume, exact: true }),
      ]) {
        await expect.element(locator).toBeVisible();
        const element = locator.element();
        const bounds = element.getBoundingClientRect();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const rects: DOMRect[] = [];
        let node = walker.nextNode();
        while (node) {
          if (node.textContent?.trim()) {
            const range = document.createRange();
            range.selectNodeContents(node);
            rects.push(...range.getClientRects());
          }
          node = walker.nextNode();
        }
        expect(rects.length).toBeGreaterThan(0);
        for (const rect of rects) {
          expect(rect.left).toBeGreaterThanOrEqual(bounds.left - 2);
          expect(rect.right).toBeLessThanOrEqual(bounds.right + 2);
          expect(rect.top).toBeGreaterThanOrEqual(bounds.top - 2);
          expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom + 2);
        }
      }
    }
    await review.click();
    await expect
      .element(screen.getByRole("region", { name: labels.kiosk_review_title, exact: true }))
      .toBeVisible();
    const confirm = screen.getByRole("button", { name: labels.kiosk_confirm, exact: true });
    const control = confirm.element();
    if (!(control instanceof HTMLElement)) throw new Error("確認操作がHTML要素ではありません");
    control.style.fontSize = `${Number.parseFloat(getComputedStyle(control).fontSize) * 2}px`;
    await expect.element(confirm).toBeEnabled();
    expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 2);
    expect(control.scrollHeight).toBeLessThanOrEqual(control.clientHeight + 2);
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  },
);

it("音声開始が失敗しても実Queryのカートと画面操作を維持する", async () => {
  // APIの開始拒否まで実WebRTCを通し、OSのマイク取得だけを無音トラックに置き換える。
  const audio = new AudioContext();
  const stream = audio.createMediaStreamDestination().stream;
  try {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    await render(
      <LocaleProvider initialLocale="ja" persist={false}>
        <QueryClientProvider client={client}>
          <Kiosk />
        </QueryClientProvider>
      </LocaleProvider>,
    );
    await expect
      .element(page.getByRole("button", { name: "音声を再開", exact: true }))
      .toBeVisible();
    const before = structuredClone(current.cart);
    await page.getByRole("button", { name: "音声を再開", exact: true }).click();
    await expect
      .element(page.getByText("音声サービスの準備が整い次第ご利用いただけます。"))
      .toBeVisible();
    await page.getByRole("tab", { name: "おしながき", exact: true }).click();
    await expect
      .element(page.getByRole("tab", { name: "おしながき", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    expect(client.getQueryData<TableState>(["tablecast-table"])?.cart).toEqual(before);
    expect(requests.filter((request) => request.url.endsWith("/voice/start"))).toHaveLength(1);
    expect(stream.getAudioTracks()[0].readyState).toBe("ended");
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    await audio.close();
  }
});

function Subscription({ storeId, onChange }: { storeId: string; onChange: () => void }) {
  const connected = useRealtime({ storeId }, 10, onChange);
  return <output aria-label="接続状態">{connected ? "接続済み" : "切断中"}</output>;
}
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
      .toHaveTextContent("接続済み");
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

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)("$localeの商品0件でも店員を呼べる", async ({ locale, labels }) => {
  current.locale = locale;
  current.uiSection = "menu";
  current.staffCalled = false;
  current.cart = { ...current.cart, lines: [], total: 0 };
  catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products: [], categories: [] },
  });
  await page.viewport(1280, 800);
  await render(
    <LocaleProvider initialLocale={locale} persist={false}>
      <QueryClientProvider client={client}>
        <Kiosk />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  await expect.element(page.getByText(labels.kiosk_menu_empty)).toBeVisible();
  await page.screenshot({
    path: `../../test-results/browser/tablecast-empty-menu-${server.browser}-${locale}.png`,
  });
  await page.getByRole("button", { name: labels.kiosk_call_staff, exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: labels.kiosk_called_staff, exact: true }))
    .toBeDisabled();
  expect(requests.filter((request) => request.url.endsWith("/table/call"))).toHaveLength(1);
});

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)("$localeの商品取得失敗は空状態にせず再試行できる", async ({ locale, labels }) => {
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([]);
  current.locale = locale;
  current.uiSection = "menu";
  catalogResponse = Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
  await render(
    <LocaleProvider initialLocale={locale} persist={false}>
      <QueryClientProvider client={client}>
        <Kiosk />
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
  catalogResponse = Response.json(catalog);
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

it("店舗テーマでもヘッダーと音声・カート操作を縦横で維持する", async () => {
  current.uiSection = "menu";
  current.staffCalled = false;
  catalogResponse = Response.json({
    ...catalog,
    configuration: {
      ...catalog.configuration,
      appearance: {
        colours: { ink: "#201a16", paper: "#fff8e7", accent: "#bb241c" },
        parts: {
          header: { background: "#fff8e7" },
          "product-card": { borderWidth: 3, borderColor: "#201a16", radius: 4, shadow: "offset" },
        },
      },
    },
  });
  await page.viewport(1180, 820);
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <QueryClientProvider client={client}>
        <Kiosk />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  for (const [width, height] of [
    [1180, 820],
    [820, 1180],
  ]) {
    await page.viewport(width, height);
    await expect.element(page.getByRole("button", { name: ja.kiosk_call_staff })).toBeVisible();
    await expect.element(page.getByRole("button", { name: ja.kiosk_review })).toBeVisible();
    const voice = document.querySelector('[data-theme-part="voice-controls"]');
    if (!voice) throw new Error("音声操作が必要です");
    expect(voice.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  }
  await page.getByRole("button", { name: ja.kiosk_call_staff }).click();
  await expect.element(page.getByRole("button", { name: ja.kiosk_called_staff })).toBeDisabled();
});
