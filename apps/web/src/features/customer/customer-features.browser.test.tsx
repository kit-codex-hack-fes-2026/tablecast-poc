import { Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import {
  customerConsentVersion,
  customerMemoryInputSchema,
  customerPreferencesSchema,
} from "@tablecast/api/schema";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { MotionProvider } from "../../components/motion-provider";
import { CustomerStore } from "./customer-store";
import { CustomerMemories } from "./customer-memories";
import { CustomerPoints } from "./customer-points";
import { CustomerCoupons } from "./customer-coupons";
import "../../styles.css";

let client: QueryClient;
let initialViewport: { width: number; height: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

async function show(view: ReactNode, locale: "ja" | "en" = "ja") {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({
    component: () => <Suspense fallback={<p>読込中</p>}>{view}</Suspense>,
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

const base = "/api/customer/stores/tablecast-store";
it("日本語で初回同意後の設定を保存し、新しい画面でも撤回済み設定を表示する", async () => {
  const locale = "ja";
  const labels = ja;
  let membership: object | null = null;
  const writes: { path: string; value: unknown }[] = [];
  const response = () => ({ store: { id: "tablecast-store", name: "卓上喫茶" }, membership });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === `${base}/visits`) return Response.json({ visits: [], nextCursor: null });
    if (path === base) return Response.json(response());
    const value = await request.json();
    writes.push({ path, value });
    if (path === `${base}/enrol`)
      membership = {
        id: "tablecast-member",
        active: true,
        joinedAt: 1,
        revision: 1,
        shareCompanions: true,
        useMemories: true,
        saveMemories: true,
      };
    else if (path === `${base}/preferences`)
      membership = { ...membership, ...customerPreferencesSchema.parse(value), revision: 2 };
    else throw new Error(`未定義の要求: ${path}`);
    return Response.json(response());
  });
  await page.viewport(390, 844);
  await show(<CustomerStore storeId="tablecast-store" />, locale);
  await page.getByRole("button", { name: labels.customer_enrol, exact: true }).click();
  await expect
    .element(page.getByRole("heading", { name: labels.customer_preferences }))
    .toBeVisible();
  await page.getByRole("checkbox", { name: labels.customer_save_memories, exact: true }).click();
  await page.getByRole("button", { name: labels.customer_save_preferences }).click();
  await expect
    .element(page.getByRole("status").filter({ hasText: labels.account_saved }))
    .toBeVisible();
  expect(writes).toEqual([
    { path: `${base}/enrol`, value: { consentVersion: customerConsentVersion } },
    {
      path: `${base}/preferences`,
      value: { revision: 1, shareCompanions: true, useMemories: true, saveMemories: false },
    },
  ]);
  await cleanup();
  client.clear();
  await show(<CustomerStore storeId="tablecast-store" />, locale);
  await expect
    .element(page.getByRole("checkbox", { name: labels.customer_save_memories, exact: true }))
    .not.toBeChecked();
  await expect
    .element(page.getByRole("button", { name: labels.customer_enrol, exact: true }))
    .not.toBeInTheDocument();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});

it("日本語で記憶を作成・編集し、新しい画面で再取得して削除する", async () => {
  const locale = "ja";
  const labels = ja;
  let memories: {
    id: string;
    revision: number;
    content: string;
    createdAt: number;
    sourceKind: string;
  }[] = [];
  const writes: unknown[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === `${base}/memories` && request.method === "GET")
      return Response.json({ memories, nextCursor: null });
    const value = await request.json();
    writes.push(value);
    if (path === `${base}/memories`) {
      const memory = customerMemoryInputSchema.parse(value);
      memories = [{ ...memory, revision: memory.revision + 1, createdAt: 1, sourceKind: "manual" }];
    } else if (path === `${base}/memories/${memories[0]?.id}/delete`) memories = [];
    else throw new Error(`未定義の要求: ${path}`);
    return Response.json({ saved: true });
  });
  await show(<CustomerMemories storeId="tablecast-store" />, locale);
  await page.getByRole("button", { name: labels.customer_memory_add }).click();
  await page
    .getByRole("textbox", { name: labels.customer_memory_content })
    .fill("I prefer less sweet drinks.");
  await page.getByRole("button", { name: labels.account_save, exact: true }).click();
  await expect
    .element(page.getByText("I prefer less sweet drinks.", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: labels.customer_edit, exact: true }).click();
  await page
    .getByRole("textbox", { name: labels.customer_memory_content })
    .fill("I prefer dry gin cocktails.");
  await page.getByRole("button", { name: labels.account_save, exact: true }).click();
  await expect
    .element(page.getByText("I prefer dry gin cocktails.", { exact: true }))
    .toBeVisible();
  expect(writes).toEqual([
    { id: memories[0]?.id, revision: 0, content: "I prefer less sweet drinks." },
    { id: memories[0]?.id, revision: 1, content: "I prefer dry gin cocktails." },
  ]);
  await cleanup();
  client.clear();
  await show(<CustomerMemories storeId="tablecast-store" />, locale);
  await expect
    .element(page.getByText("I prefer dry gin cocktails.", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: labels.customer_delete, exact: true }).click();
  await expect
    .element(page.getByText("I prefer dry gin cocktails.", { exact: true }))
    .not.toBeInTheDocument();
  expect(writes[2]).toEqual({ revision: 2 });
});

it("ポイント交換の失敗は同じキーで再試行し、交換した券を来店へ申請する", async () => {
  const rules = {
    title: { ja: "会員の100円割引", en: "Member discount" },
    description: { ja: "100円引き", en: "JPY 100 off" },
    startsAt: 1,
    endsAt: 9999999999999,
    minimumYen: 0,
    discountKind: "fixed",
    discountValue: 100,
    maximumYen: 100,
    trigger: "exchange",
    threshold: 3,
    imageKey: "tablecast/coupon.webp",
    imageKind: "illustration",
    imageSource: { generated: false, description: "店舗の券面" },
  };
  let exchanged = false;
  let requested = false;
  const writes: { path: string; value: unknown }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === `${base}/points`)
      return Response.json({
        balance: 4,
        totals: { visits: 1, allocatedYen: 0 },
        entries: [{ id: "entry", delta: 4, reasonKind: "award", createdAt: 1 }],
        nextCursor: null,
      });
    if (path === `${base}/coupons`)
      return Response.json({
        coupons: exchanged
          ? [
              {
                id: "coupon",
                rules,
                state: requested ? "requested" : "available",
                inDate: true,
                requestedSessionId: requested ? "tablecast-visit" : null,
              },
            ]
          : [],
        nextCursor: null,
      });
    if (path === `${base}/coupons/exchanges`)
      return Response.json({ rules: [{ id: "rule", rules }], nextCursor: null });
    writes.push({ path, value: await request.json() });
    if (path === `${base}/coupons/exchange`) {
      if (writes.length === 1) return Response.json({}, { status: 503 });
      exchanged = true;
    } else if (path === `${base}/coupons/coupon/request`) requested = true;
    else throw new Error(`未定義の要求: ${path}`);
    return Response.json({ saved: true });
  });
  await show(
    <>
      <CustomerPoints storeId="tablecast-store" />
      <CustomerCoupons storeId="tablecast-store" sessionId="tablecast-visit" />
    </>,
  );
  await expect.element(page.getByText("+4 pt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `${ja.coupon_exchange} · 3 pt`, exact: true }).click();
  await expect.element(page.getByRole("alert")).toMatchTextContent(ja.common_unavailable);
  await page.getByRole("button", { name: `${ja.coupon_exchange} · 3 pt`, exact: true }).click();
  await expect.element(page.getByText(ja.coupon_available, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: ja.coupon_request, exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: ja.coupon_request, exact: true }))
    .toBeDisabled();
  expect(writes).toMatchObject([
    {
      path: `${base}/coupons/exchange`,
      value: { ruleId: "rule" },
    },
    {
      path: `${base}/coupons/exchange`,
      value: { ruleId: "rule" },
    },
    { path: `${base}/coupons/coupon/request`, value: { sessionId: "tablecast-visit" } },
  ]);
  expect(writes[0]?.value).toHaveProperty("idempotencyKey", expect.any(String));
  expect(writes[1]?.value).toEqual(writes[0]?.value);
});
