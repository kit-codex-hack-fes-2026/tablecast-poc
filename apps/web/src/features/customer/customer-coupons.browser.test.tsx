import { couponRuleSchema } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { fixtureValue } from "../../test-support/fixture-value";
import { CustomerCoupons, OwnedCoupons } from "./customer-coupons";
import { customerCouponsOptions, customerExchangesOptions } from "./customer-coupons-query";

let client: QueryClient;
let viewport: { height: number; width: number };
beforeEach(() => {
  viewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(viewport.width, viewport.height);
});

const storeId = "tablecast-store";
const base = `/api/customer/stores/${storeId}/coupons`;
const rules = couponRuleSchema.parse({
  title: { ja: "保有している100円券", en: "Your JPY 100 coupon" },
  description: { ja: "お会計から100円引き", en: "JPY 100 off your bill" },
  startsAt: 1,
  endsAt: 9999999999999,
  minimumYen: 0,
  discountKind: "fixed",
  discountValue: 100,
  maximumYen: 100,
  trigger: "exchange",
  threshold: 3,
  imageKey: `tablecast/uploads/${"a".repeat(64)}.webp`,
  imageKind: "illustration",
  imageSource: { generated: false, description: "店舗の券面" },
});
const available = {
  coupons: {
    coupons: [{ id: "coupon", rules, state: "available", inDate: true, requestedSessionId: null }],
    nextCursor: null,
  },
  exchanges: {
    rules: [
      {
        id: "rule",
        rules: { ...rules, title: { ja: "交換できる100円券", en: "Exchange for JPY 100 off" } },
      },
    ],
    nextCursor: null,
  },
};
const empty = {
  coupons: { coupons: [], nextCursor: null },
  exchanges: { rules: [], nextCursor: null },
};
type Collection = keyof typeof available;
function respond(reply: (collection: Collection) => Promise<Response> | Response) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === `/api/customer/stores/${storeId}/visits`)
      return Response.json({ visits: [], nextCursor: null });
    if (request.method === "GET" && path === base) return reply("coupons");
    if (request.method === "GET" && path === `${base}/exchanges`) return reply("exchanges");
    throw new Error(`未定義の要求: ${request.method} ${path}`);
  });
}
async function show(locale: "en" | "ja" = "ja", connected = false, sessionId?: string) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <main className="mx-auto max-w-2xl p-5">
        {connected ? (
          <OwnedCoupons storeId={storeId} sessionId="tablecast-current-visit" compact />
        ) : (
          <CustomerCoupons storeId={storeId} sessionId={sessionId} />
        )}
      </main>
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
const region = (collection: Collection) =>
  page.getByRole("region", {
    name: collection === "coupons" ? ja.customer_coupons_owned : ja.coupon_exchange,
    exact: true,
  });
const titles = {
  coupons: rules.title.ja,
  exchanges: fixtureValue(available.exchanges.rules[0]).rules.title.ja,
};

it.each([0, 1, 2])(
  "卓の指定がないPWA再訪で接続中の来店%d件を明示選択し、0件だけQRを案内する",
  async (count) => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (request.method !== "GET") throw new Error("卓の選択前に券を申請してはいけません");
      if (path === base) return Response.json(available.coupons);
      if (path === `${base}/exchanges`) return Response.json(empty.exchanges);
      if (path === `/api/customer/stores/${storeId}/visits`)
        return Response.json({
          visits: Array.from({ length: count }, (_, index) => ({
            sessionId: `visit-${index}`,
            tableName: `T${index + 10}`,
            status: "open",
            leftAt: null,
          })),
          nextCursor: null,
        });
      throw new Error(`未定義の要求: ${path}`);
    });
    await show();
    await expect
      .element(region("coupons").getByRole("heading", { name: rules.title.ja }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: ja.coupon_request, exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(
        page.getByText(
          count === 0 ? ja.customer_coupon_how_unconnected : ja.customer_coupon_choose_visit,
          { exact: true },
        ),
      )
      .toBeVisible();
    await expect
      .element(
        page.getByText(
          count === 0 ? ja.customer_coupon_choose_visit : ja.customer_coupon_how_unconnected,
          { exact: true },
        ),
      )
      .not.toBeInTheDocument();
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/visits/"]')].map((link) => ({
        name: link.textContent,
        href: link.getAttribute("href"),
      })),
    ).toEqual(
      Array.from({ length: count }, (_, index) => ({
        name: `T${index + 10}で使う`,
        href: `/member/${storeId}/visits/visit-${index}`,
      })),
    );
  },
);

it("古い券URLの来店が終了済みなら申請を出さず、現在の卓を選び直せる", async () => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") throw new Error("終了済みの来店へ申請してはいけません");
    if (path === base) return Response.json(available.coupons);
    if (path === `${base}/exchanges`) return Response.json(empty.exchanges);
    if (path === `/api/customer/stores/${storeId}/visits/old-visit`)
      return Response.json({ connected: false, tableName: "T09", openedAt: 1 });
    if (path === `/api/customer/stores/${storeId}/visits`)
      return Response.json({
        visits: [{ sessionId: "current-visit", tableName: "T10", status: "open", leftAt: null }],
        nextCursor: null,
      });
    throw new Error(`未定義の要求: ${path}`);
  });
  await show("ja", false, "old-visit");
  await expect
    .element(page.getByText(new RegExp(`T09.*${ja.customer_disconnected}`)))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ja.coupon_request, exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("link", { name: "T10で使う", exact: true }))
    .toHaveAttribute("href", `/member/${storeId}/visits/current-visit`);
});

it("指定来店の確認失敗中は申請を出さず、再試行で接続を確認してから申請できる", async () => {
  let failing = true;
  const writes: unknown[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === base) return Response.json(available.coupons);
    if (path === `${base}/exchanges`) return Response.json(empty.exchanges);
    if (path === `/api/customer/stores/${storeId}/visits`)
      return Response.json({ visits: [], nextCursor: null });
    if (path === `/api/customer/stores/${storeId}/visits/current-visit`)
      return failing
        ? Response.json({}, { status: 503 })
        : Response.json({ connected: true, tableName: "T10", openedAt: 1 });
    if (path === `${base}/coupon/request`) {
      writes.push(await request.json());
      return Response.json({ saved: true });
    }
    throw new Error(`未定義の要求: ${path}`);
  });
  await show("ja", false, "current-visit");
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ja.coupon_request, exact: true }))
    .not.toBeInTheDocument();
  failing = false;
  await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
  const action = page.getByRole("button", { name: ja.coupon_request, exact: true });
  await expect.element(action).toBeEnabled();
  await expect.element(page.getByText(new RegExp(`T10.*${ja.customer_connected}`))).toBeVisible();
  await action.click();
  expect(writes).toEqual([{ sessionId: "current-visit" }]);
});

it.each(["ja", "en"] as const)(
  "%sの来店ウォレットで券面・金額・申請を直接表示し、表示中の来店へ申請する",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    const writes: unknown[] = [];
    let requested = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === base)
        return Response.json({
          coupons: [
            {
              ...available.coupons.coupons[0],
              state: requested ? "requested" : "available",
              requestedSessionId: requested ? "tablecast-current-visit" : null,
            },
          ],
          nextCursor: null,
        });
      if (request.method === "POST" && path === `${base}/coupon/request`) {
        writes.push(await request.json());
        requested = true;
        return Response.json({ saved: true });
      }
      throw new Error(`未定義の要求: ${request.method} ${path}`);
    });
    await page.viewport(402, 874);
    await show(locale, true);
    const owned = page.getByRole("region", { name: labels.customer_coupons_owned, exact: true });
    await expect
      .element(owned.getByRole("img", { name: rules.title[locale], exact: true }))
      .toBeVisible();
    await expect.element(owned.getByText("¥100", { exact: true })).toBeVisible();
    const action = owned.getByRole("button", { name: labels.coupon_request, exact: true });
    await expect.element(action).toBeEnabled();
    expect(action.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(874);
    await owned.getByRole("button", { name: labels.customer_coupon_details, exact: true }).click();
    await expect.element(owned.getByText(rules.description[locale], { exact: true })).toBeVisible();
    await action.click();
    expect(writes).toEqual([{ sessionId: "tablecast-current-visit" }]);
    await expect.element(action).toBeDisabled();
    await expect
      .element(owned.getByRole("status"))
      .toHaveTextContent(labels.customer_coupon_requested_hint);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(402);
  },
);

it("保有券と交換候補の初回待機を別々に示し、一方が空でも他方の読込中を保つ", async () => {
  const gates = {
    coupons: Promise.withResolvers<void>(),
    exchanges: Promise.withResolvers<void>(),
  };
  const started = new Set<Collection>();
  respond(async (collection) => {
    started.add(collection);
    await gates[collection].promise;
    return Response.json(empty[collection]);
  });
  await show();
  try {
    await expect.poll(() => started.size).toBe(2);
    await expect.element(region("coupons")).toHaveAttribute("aria-busy", "true");
    await expect.element(region("exchanges")).toHaveAttribute("aria-busy", "true");
    await expect
      .element(region("coupons").getByRole("status"))
      .toHaveTextContent(ja.common_loading);
    await expect
      .element(region("exchanges").getByRole("status"))
      .toHaveTextContent(ja.common_loading);
    await expect.element(page.getByText(ja.customer_coupons_empty)).not.toBeInTheDocument();
    gates.coupons.resolve();
    await expect.element(region("coupons").getByText(ja.customer_coupons_empty)).toBeVisible();
    await expect.element(region("exchanges")).toHaveAttribute("aria-busy", "true");
    await expect.element(page.getByText(ja.customer_exchanges_empty)).not.toBeInTheDocument();
  } finally {
    gates.coupons.resolve();
    gates.exchanges.resolve();
    await expect.poll(() => client.isFetching()).toBe(0);
  }
});

it.each(["ja", "en"] as const)("%sの狭い画面で保有券と交換候補の0件を区別する", async (locale) => {
  const labels = locale === "ja" ? ja : en;
  respond((collection) => Response.json(empty[collection]));
  await page.viewport(320, 740);
  await show(locale);
  await expect
    .element(
      page
        .getByRole("region", { name: labels.customer_coupons_owned })
        .getByText(labels.customer_coupons_empty),
    )
    .toBeVisible();
  await expect
    .element(
      page
        .getByRole("region", { name: labels.coupon_exchange })
        .getByText(labels.customer_exchanges_empty),
    )
    .toBeVisible();
  await expect.element(page.getByRole("status")).not.toBeInTheDocument();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
});

it.each(["coupons", "exchanges"] as const)(
  "%sの初回取得だけ失敗しても他方を表示し、再試行で回復する",
  async (failed) => {
    let failing = true;
    respond((collection) =>
      collection === failed && failing
        ? Response.json({}, { status: 503 })
        : Response.json(available[collection]),
    );
    await show();
    const other = failed === "coupons" ? "exchanges" : "coupons";
    await expect
      .element(region(failed).getByRole("alert"))
      .toMatchTextContent(ja.common_unavailable);
    await expect
      .element(region(other).getByRole("heading", { name: titles[other], exact: true }))
      .toBeVisible();
    await expect.element(region(failed).getByRole("status")).not.toBeInTheDocument();
    failing = false;
    await region(failed).getByRole("button", { name: ja.common_retry, exact: true }).click();
    await expect
      .element(region(failed).getByRole("heading", { name: titles[failed], exact: true }))
      .toBeVisible();
    await expect.element(region(failed).getByRole("alert")).not.toBeInTheDocument();
  },
);

it.each(["coupons", "exchanges"] as const)(
  "%sの背景取得失敗でも既取得の券を残し、再試行できる",
  async (failed) => {
    let failing = false;
    respond((collection) =>
      collection === failed && failing
        ? Response.json({}, { status: 503 })
        : Response.json(available[collection]),
    );
    await show();
    const card = region(failed).getByRole("heading", { name: titles[failed], exact: true });
    await expect.element(card).toBeVisible();
    failing = true;
    await client.invalidateQueries({
      queryKey:
        failed === "coupons"
          ? customerCouponsOptions(storeId).queryKey
          : customerExchangesOptions(storeId).queryKey,
      exact: true,
    });
    await expect
      .element(region(failed).getByRole("alert"))
      .toMatchTextContent(ja.common_unavailable);
    await expect.element(card).toBeVisible();
    await expect.element(region(failed).getByRole("status")).toBeEmptyDOMElement();
    failing = false;
    await region(failed).getByRole("button", { name: ja.common_retry, exact: true }).click();
    await expect.element(region(failed).getByRole("alert")).not.toBeInTheDocument();
    await expect.element(card).toBeVisible();
  },
);
