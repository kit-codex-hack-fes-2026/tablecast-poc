import { cleanup, render } from "vitest-browser-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uiSectionInputSchema, type TableState } from "@tablecast/api/schema";
import { catalog, table } from "../../../.storybook/tablecast-fixtures";
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

let client: QueryClient;
let current: TableState;
let unexpected: string[];
const requests: Request[] = [];
beforeEach(() => {
  vi.stubGlobal("WebSocket", TablecastSocket);
  TablecastSocket.instances = [];
  current = structuredClone(table);
  current.uiSection = "cart";
  current.voiceState = "stopped";
  current.voiceSessionId = null;
  unexpected = [];
  requests.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/api/table") return Response.json(current);
      if (request.method === "GET" && path === "/api/table/catalog") return Response.json(catalog);
      if (request.method === "GET" && path.endsWith("/events")) {
        return Response.json({ cursor: current.cursor, events: [] });
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
          expiresAt: Date.now() + 60000,
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
  await cleanup();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
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
      <LocaleProvider initialLocale={locale}>
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
  await render(
    <LocaleProvider initialLocale="ja">
      <QueryClientProvider client={client}>
        <Kiosk />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  await expect.element(page.getByRole("button", { name: "音声を再開", exact: true })).toBeVisible();
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
