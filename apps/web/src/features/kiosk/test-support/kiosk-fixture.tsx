import {
  type CartUpdate,
  cartUpdateSchema,
  submitSchema,
  type TableState,
  uiSectionInputSchema,
} from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { catalog, table } from "../../../../.storybook/tablecast-fixtures";
import { MotionProvider } from "../../../components/motion-provider";
import { LocaleProvider } from "../../../i18n/locale";
import { useRealtime } from "../../../lib/use-realtime";
import "../../../styles.css";
import { Kiosk } from "../kiosk";

// 接続先だけを差し替える。hook、QueryClient、HTTP client、画面は本番実装を使う。
export class TablecastSocket extends EventTarget {
  static instances: TablecastSocket[] = [];
  closed = false;
  constructor(readonly url: string) {
    super();
    TablecastSocket.instances.push(this);
  }
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
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

let selectedParticipant: null | string;

let participantNames: string[];

export const cartWrites: CartUpdate[] = [];

export const targetWrites: unknown[] = [];

export const orderWrites: ReturnType<typeof submitSchema.parse>[] = [];

export const requests: Request[] = [];

let initialViewport: { height: number; width: number };

beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
  vi.stubGlobal("WebSocket", TablecastSocket);
  // カートと通知の統合では実端末のマイク列挙を避ける。
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([]);
  TablecastSocket.instances = [];
  catalogResponse = Response.json(catalog);
  current = structuredClone(table);
  current.uiSection = "cart";
  current.voiceState = "stopped";
  current.voiceSessionId = null;
  unexpected = [];
  requests.length = 0;
  cartWrites.length = 0;
  targetWrites.length = 0;
  orderWrites.length = 0;
  cartFailure = 0;
  confirmationDuration = 60_000;
  selectedParticipant = null;
  participantNames = [];
  savedCart = structuredClone(table.cart);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/api/table/participants")
        return Response.json({
          participants: participantNames.map((name, index) => ({
            id: `11111111-1111-4111-8111-11111111111${index}`,
            name,
          })),
          context: {
            selectedParticipantId: selectedParticipant,
            token: "22222222-2222-4222-8222-222222222222",
          },
        });
      if (request.method === "POST" && path === "/api/table/customer-target") {
        targetWrites.push(await request.json());
        selectedParticipant = "11111111-1111-4111-8111-111111111111";
        return Response.json({ selected: true });
      }
      if (request.method === "POST" && path === "/api/table/customer-code")
        return Response.json({
          code: "a".repeat(64),
          expiresAt: Date.now() + 300000,
          url: `${window.location.origin}/member/join?code=${"a".repeat(64)}`,
        });
      if (request.method === "GET" && path === "/api/table") return Response.json(current);
      if (request.method === "GET" && path === "/api/table/exchange-rates")
        return Response.json({
          base: "JPY",
          source: "currency-api",
          date: "2026-10-22",
          rates: { USD: 0.0065, AUD: 0.00967 },
        });
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
      if (request.method === "POST" && path === "/api/table/bill/request") {
        current = {
          ...current,
          staffCalled: true,
          billRequested: true,
          cursor: current.cursor + 1,
        };
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
      if (request.method === "POST" && path === "/api/table/orders") {
        orderWrites.push(submitSchema.parse(await request.json()));
        current = {
          ...current,
          cursor: current.cursor + 1,
          cart: { ...current.cart, lines: [], total: 0, version: current.cart.version + 1 },
          snapshot: null,
        };
        return Response.json({ orderId: "tablecast-confirmed-order" });
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
      const name = cookie.trim().split("=")[0] ?? "";
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

export async function mountKiosk() {
  return render(
    <LocaleProvider initialLocale={current.locale} persist={false}>
      <QueryClientProvider client={client}>
        <MotionProvider>
          <Kiosk />
        </MotionProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

export function notify(kind: "cart.updated" | "configuration.published") {
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

export const orderPanel = () => document.getElementById("tablecast-order");

export function Subscription({ storeId, onChange }: { onChange: () => void; storeId: string }) {
  const connected = useRealtime({ storeId }, 10, onChange);
  return <output aria-label="接続状態">{connected ? "接続済み" : "切断中"}</output>;
}

export const fixture = {
  get catalogResponse() {
    return catalogResponse;
  },
  set catalogResponse(value: typeof catalogResponse) {
    catalogResponse = value;
  },
  get current() {
    return current;
  },
  set current(value: typeof current) {
    current = value;
  },
  get savedCart() {
    return savedCart;
  },
  set savedCart(value: typeof savedCart) {
    savedCart = value;
  },
  get cartFailure() {
    return cartFailure;
  },
  set cartFailure(value: typeof cartFailure) {
    cartFailure = value;
  },
  get confirmationDuration() {
    return confirmationDuration;
  },
  set confirmationDuration(value: typeof confirmationDuration) {
    confirmationDuration = value;
  },
  get client() {
    return client;
  },
  set client(value: typeof client) {
    client = value;
  },
  get participantNames() {
    return participantNames;
  },
  set participantNames(value: typeof participantNames) {
    participantNames = value;
  },
};
