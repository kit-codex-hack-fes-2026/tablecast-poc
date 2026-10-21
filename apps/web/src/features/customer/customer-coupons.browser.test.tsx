import { couponRuleSchema } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { fixtureValue } from "../../test-support/fixture-value";
import { CustomerCoupons } from "./customer-coupons";
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
    if (request.method === "GET" && path === base) return reply("coupons");
    if (request.method === "GET" && path === `${base}/exchanges`) return reply("exchanges");
    throw new Error(`未定義の要求: ${request.method} ${path}`);
  });
}
async function show(locale: "en" | "ja" = "ja") {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <main className="mx-auto max-w-2xl p-5">
          <CustomerCoupons storeId={storeId} />
        </main>
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
