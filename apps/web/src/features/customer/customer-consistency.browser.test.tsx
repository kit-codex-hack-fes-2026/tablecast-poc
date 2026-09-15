import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { PointVisit } from "../store/point-visit";
import { CustomerMemberships } from "./customer-memberships";
import { CustomerVisit } from "./customer-visits";
import { customerVisitOptions } from "./customer-visit-query";
import "../../styles.css";

let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
async function show(view: ReactNode) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  const root = createRootRoute({
    component: () => <main className="mx-auto max-w-xl p-6">{view}</main>,
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("会員証一覧の続きから101番目の店舗へ移動できる", async () => {
  const cursors: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url);
    if (url.pathname !== "/api/customer/memberships")
      throw new Error(`未定義の要求: ${url.pathname}`);
    const before = url.searchParams.get("beforeId");
    if (before) cursors.push(before);
    return Response.json({
      memberships: before
        ? [{ id: "last", storeId: "last", name: "101番目の店舗", joinedAt: 1 }]
        : Array.from({ length: 100 }, (_, i) => ({
            id: `member-${i}`,
            storeId: `store-${i}`,
            name: `店舗 ${i + 1}`,
            joinedAt: 2,
          })),
      nextCursor: before ? null : { beforeId: "member-99", beforeJoinedAt: "2" },
    });
  });
  await show(<CustomerMemberships />);
  await page.getByRole("button", { name: ja.customer_more }).click();
  await expect.element(page.getByRole("link", { name: /101番目の店舗/ })).toBeVisible();
  expect(cursors).toEqual(["member-99"]);
  await expect
    .element(page.getByRole("button", { name: ja.customer_more }))
    .not.toBeInTheDocument();
});

it("来店の再取得で追加注文と状態変更を注文欄へ反映する", async () => {
  const first = {
    id: "order-1",
    status: "submitted",
    snapshot: {
      lines: [{ id: "line-1", name: { ja: "最初のお茶", en: "First tea" }, quantity: 1 }],
    },
    personalRecords: [],
  };
  let orders = [first];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url);
    if (!url.pathname.startsWith("/api/customer/stores/tablecast-store/visits/tablecast-visit"))
      throw new Error(`未定義の要求: ${url.pathname}`);
    return Response.json({
      storeId: "tablecast-store",
      storeName: "卓上喫茶",
      tableName: "01",
      sessionId: "tablecast-visit",
      status: "open",
      openedAt: 1,
      closedAt: null,
      participantId: "person",
      connected: true,
      participants: [{ id: "person", name: "本人", leftAt: null }],
      orders,
      nextOrderId: null,
      nextOrderCursor: null,
    });
  });
  await show(<CustomerVisit storeId="tablecast-store" sessionId="tablecast-visit" />);
  await expect.element(page.getByText("最初のお茶", { exact: true })).toBeVisible();
  orders = [
    { ...first, status: "served" },
    {
      ...first,
      id: "order-2",
      snapshot: {
        lines: [
          { id: "line-2", name: { ja: "追加のカクテル", en: "Another cocktail" }, quantity: 1 },
        ],
      },
    },
  ];
  await client.invalidateQueries({
    queryKey: customerVisitOptions("tablecast-store", "tablecast-visit").queryKey,
    exact: true,
  });
  await expect.element(page.getByText("追加のカクテル", { exact: true })).toBeVisible();
  await expect.element(page.getByText(ja.order_served, { exact: true })).toBeVisible();
});

it("対象者ゼロで付与確定しても参加者の付与漏れを理由付きで訂正できる", async () => {
  const corrections: unknown[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === "/api/admin/stores/tablecast-store/points/corrections") {
      corrections.push(await request.json());
      return Response.json({ saved: true });
    }
    if (url.pathname === "/api/admin/stores/tablecast-store/tables/tablecast-visit/points")
      return Response.json({
        sessionId: "tablecast-visit",
        expectedVersion: 1,
        rules: { enabled: true, kind: "visit", points: 1, unitYen: 100 },
        confirmedAt: 1,
        participants: [
          {
            id: "person",
            membershipId: "member",
            name: "本人",
            active: true,
            joinedAt: 1,
            leftAt: null,
          },
        ],
        allocations: [],
        idempotencyKey: "confirmed",
      });
    throw new Error(`未定義の要求: ${url.pathname}`);
  });
  await show(<PointVisit storeId="tablecast-store" sessionId="tablecast-visit" />);
  await page.getByText(ja.customer_points_correct, { exact: true }).click();
  await page.getByRole("spinbutton", { name: ja.customer_points_delta }).fill("4");
  await page.getByRole("textbox", { name: ja.customer_points_reason }).fill("付与漏れの訂正");
  await page.getByRole("button", { name: ja.account_save, exact: true }).click();
  await expect
    .poll(() => corrections)
    .toMatchObject([{ membershipId: "member", delta: 4, reason: "付与漏れの訂正" }]);
  await expect
    .element(page.getByRole("status").filter({ hasText: ja.account_saved }))
    .toBeVisible();
  await page.screenshot({
    path: "../../../test-results/browser/tablecast-point-omission-correction.png",
  });
});
