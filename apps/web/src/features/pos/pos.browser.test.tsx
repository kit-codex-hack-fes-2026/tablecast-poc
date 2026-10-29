import type { PosCheckoutView, PosSettings } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider, useI18n } from "../../i18n/locale";
import "../../styles.css";
import { StoreContext } from "../store/store-context";
import { PosCheckout } from "./pos-checkout";
import {
  posCatalogOptions,
  posCheckoutOptions,
  posDevicesOptions,
  posSettingsOptions,
} from "./pos-query";
import { StorePos, StorePosSettings } from "./store-pos";
import {
  posCatalogFixture,
  posCheckoutFixture,
  posDevicesFixture,
  posSettingsFixture,
} from "./test-support/pos-fixture";
import { renderPos as render } from "./test-support/pos-render";

let client: QueryClient;
let unexpected: string[];
let initialViewport: { height: number; width: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
  unexpected = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(
    posDevicesOptions("tablecast-store", "tablecast-location").queryKey,
    posDevicesFixture,
  );
  client.setQueryData(
    posCatalogOptions("tablecast-store", "tablecast-location").queryKey,
    posCatalogFixture,
  );
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  if (window.innerWidth !== initialViewport.width || window.innerHeight !== initialViewport.height)
    await page.viewport(initialViewport.width, initialViewport.height);
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});
const providers = (children: ReactNode, locale: "en" | "ja" = "ja") => (
  <QueryClientProvider client={client}>
    <LocaleProvider initialLocale={locale} persist={false}>
      <MotionProvider>
        <main className="max-w-3xl space-y-6 p-6">{children}</main>
      </MotionProvider>
    </LocaleProvider>
  </QueryClientProvider>
);
const checkoutPath = "/api/admin/stores/tablecast-store/tables/tablecast-session/pos";

it("対応の下書き保存が競合しても入力を保持し、最新の下書き版で再送する", async () => {
  await page.viewport(1180, 820);
  let attempts = 0;
  const latest: PosSettings = {
    ...posSettingsFixture,
    draft: { id: "tablecast-pos-draft", version: 5, baseVersion: 3, status: "draft" },
  };
  const saved: unknown[] = [];
  const readDraftIds: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/admin/stores/tablecast-store/pos") {
      readDraftIds.push(url.searchParams.get("draftId") ?? "");
      return Response.json(latest);
    }
    if (
      request.method === "PUT" &&
      url.pathname === "/api/admin/stores/tablecast-store/pos/mappings"
    ) {
      saved.push(await request.json());
      if (++attempts === 1)
        return Response.json(
          { error: { code: "DRAFT_CONFLICT", message: "conflict" } },
          { status: 409 },
        );
      return Response.json({
        ...latest,
        draft: { id: "tablecast-pos-draft", version: 6, baseVersion: 3, status: "draft" },
        mappings: [
          { kind: "product", localId: "tablecast-tea", externalId: "tablecast-square-tea" },
          { kind: "option", localId: "tablecast-large", externalId: "tablecast-square-large" },
        ],
      });
    }
    unexpected.push(`${request.method} ${request.url}`);
    return new Response(null, { status: 500 });
  });
  await render(
    providers(<StorePosSettings storeId="tablecast-store" canEdit settings={posSettingsFixture} />),
  );
  const option = page.getByRole("combobox", { name: `煎茶 · 大きめ · ${ja.pos_mapping_option}` });
  await option.selectOptions("tablecast-square-large");
  const search = page.getByRole("searchbox", { name: ja.pos_mapping_search });
  await search.fill("該当する商品なし");
  await expect.element(option).not.toBeInTheDocument();
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(page.getByText(ja.pos_conflict)).toBeVisible();
  await search.fill("");
  await expect.element(option).toHaveValue("tablecast-square-large");
  await page.getByRole("button", { name: ja.pos_reload, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.pos_reload, exact: true })
    .click();
  await expect.element(option).toHaveValue("");
  await option.selectOptions("tablecast-square-large");
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(page.getByText(ja.pos_mapping_saved)).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  expect(readDraftIds).toContain("tablecast-pos-draft");
  expect(readDraftIds.every((id) => id === "tablecast-pos-draft")).toBe(true);
  expect(saved).toHaveLength(2);
  expect(saved[1]).toEqual({
    draftId: "tablecast-pos-draft",
    expectedVersion: 5,
    connectionId: "tablecast-pos-connection",
    mappings: [
      { kind: "product", localId: "tablecast-tea", externalId: "tablecast-square-tea" },
      { kind: "option", localId: "tablecast-large", externalId: "tablecast-square-large" },
    ],
  });
});

it("価格差異では開始を無効にし、取消要求後も再照会で取消が確定するまで会計を固定する", async () => {
  await page.viewport(820, 1180);
  const mismatch: PosCheckoutView = {
    ...posCheckoutFixture,
    canStart: false,
    issues: [{ code: "POS_PRICE_MISMATCH", name: "煎茶", expected: 500, actual: 510 }],
  };
  client.setQueryData(
    posCheckoutOptions("tablecast-store", "tablecast-session").queryKey,
    mismatch,
  );
  let current = mismatch;
  let startRequest: unknown;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === `${checkoutPath}/preview` && request.method === "POST")
      current = posCheckoutFixture;
    else if (path === `${checkoutPath}/start` && request.method === "POST") {
      startRequest = await request.json();
      current = {
        ...posCheckoutFixture,
        canStart: false,
        locked: true,
        canCancel: true,
        canReconcile: true,
        checkout: {
          id: "tablecast-checkout",
          status: "pending",
          amount: 600,
          currency: "JPY",
          updatedAt: 1_792_800_000_000,
          issue: null,
        },
      };
    } else if (path === `${checkoutPath}/cancel` && request.method === "POST")
      current = { ...current, canCancel: false };
    else if (path === `${checkoutPath}/reconcile` && request.method === "POST")
      current = {
        ...current,
        locked: false,
        canReconcile: false,
        checkout: {
          id: "tablecast-checkout",
          status: "cancelled",
          amount: 600,
          currency: "JPY",
          updatedAt: 1_792_800_000_000,
          issue: null,
        },
      };
    else {
      unexpected.push(`${request.method} ${path}`);
      return new Response(null, { status: 500 });
    }
    return Response.json(current);
  });
  await render(providers(<PosCheckout storeId="tablecast-store" sessionId="tablecast-session" />));
  const start = page.getByRole("button", { name: ja.pos_start });
  await expect.element(start).toBeDisabled();
  await expect.element(page.getByText(ja.pos_issue_price)).toBeVisible();
  await page.getByRole("button", { name: ja.pos_preview }).click();
  await expect.element(start).toBeEnabled();
  await start.click();
  await expect.element(page.getByText(ja.pos_checkout_pending, { exact: true })).toBeVisible();
  expect(startRequest).toMatchObject({ expectedVersion: 7 });
  if (!startRequest || typeof startRequest !== "object" || !("idempotencyKey" in startRequest))
    throw new Error("冪等キーがありません");
  expect(startRequest.idempotencyKey).toBeTypeOf("string");
  await page.getByRole("button", { name: ja.pos_cancel, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.pos_cancel, exact: true })
    .click();
  await expect
    .element(page.getByRole("button", { name: ja.pos_cancel, exact: true }))
    .not.toBeInTheDocument();
  await expect.element(start).toBeDisabled();
  await expect.element(page.getByText(ja.pos_locked)).toBeVisible();
  await expect.element(page.getByRole("button", { name: ja.pos_preview })).toBeDisabled();
  await page.getByRole("button", { name: ja.pos_reconcile }).click();
  await expect.element(page.getByText(ja.pos_checkout_cancelled, { exact: true })).toBeVisible();
  await expect.element(page.getByText(ja.pos_locked)).not.toBeInTheDocument();
});

it("決済開始の応答が途切れたときは結果不明を表示し、英語の再照会で支払い完了へ更新する", async () => {
  client.setQueryData(
    posCheckoutOptions("tablecast-store", "tablecast-session").queryKey,
    posCheckoutFixture,
  );
  await page.viewport(1180, 820);
  let startRequests = 0;
  const review: PosCheckoutView = {
    ...posCheckoutFixture,
    canStart: false,
    locked: true,
    canReconcile: true,
    checkout: {
      id: "tablecast-checkout",
      status: "review",
      amount: 600,
      currency: "JPY",
      updatedAt: 1_792_800_000_000,
      issue: "POS_UNKNOWN_OUTCOME",
    },
  };
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === `${checkoutPath}/start` && request.method === "POST") {
      startRequests++;
      throw new TypeError("connection lost");
    }
    if (path === checkoutPath && request.method === "GET") return Response.json(review);
    if (path === `${checkoutPath}/reconcile` && request.method === "POST")
      return Response.json({
        ...review,
        locked: false,
        canReconcile: false,
        checkout: { ...review.checkout, status: "completed", issue: null },
      });
    unexpected.push(`${request.method} ${path}`);
    return new Response(null, { status: 500 });
  });
  await render(
    providers(<PosCheckout storeId="tablecast-store" sessionId="tablecast-session" />, "en"),
  );
  const start = page.getByRole("button", { name: en.pos_start });
  await start.click();
  await expect.element(page.getByText(en.pos_checkout_review, { exact: true })).toBeVisible();
  await expect.element(start).toBeDisabled();
  await expect.element(page.getByText(en.pos_review_hint, { exact: true }).first()).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  await page.getByRole("button", { name: en.pos_reconcile }).click();
  await expect.element(page.getByText(en.pos_checkout_completed, { exact: true })).toBeVisible();
  await expect.element(start).toBeDisabled();
  expect(startRequests).toBe(1);
});

it("店舗メンバーには設定を読取専用で示し、管理者専用のSquareカタログを取得しない", async () => {
  client.removeQueries({ queryKey: ["tablecast-pos-catalog"] });
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    unexpected.push(new Request(input, init).url);
    return Response.json({}, { status: 500 });
  });
  await render(
    providers(
      <StorePosSettings storeId="tablecast-store" canEdit={false} settings={posSettingsFixture} />,
    ),
  );
  await expect.element(page.getByText(ja.pos_permission)).toBeVisible();
  await page.getByText(ja.pos_connection_settings, { exact: true }).click();
  await expect.element(page.getByRole("combobox", { name: ja.pos_location })).toBeDisabled();
  await expect.element(page.getByRole("button", { name: ja.pos_connect })).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: ja.pos_catalog_refresh }))
    .not.toBeInTheDocument();
  await expect.element(page.getByText(ja.common_loading, { exact: true })).not.toBeInTheDocument();
  const search = page.getByRole("searchbox", { name: ja.pos_mapping_search });
  await expect.element(search).toBeEnabled();
  await search.fill("該当する商品なし");
  await expect
    .element(page.getByRole("combobox", { name: `煎茶 · ${ja.pos_mapping_product}` }))
    .not.toBeInTheDocument();
});

it("解除要求が失敗しても解除処理中を再取得し、再接続と保存を止めながら解除を再試行できる", async () => {
  const published = { ...posSettingsFixture, draft: null };
  client.setQueryData(posSettingsOptions("tablecast-store").queryKey, published);
  let deletes = 0;
  let settingsReads = 0;
  const disconnecting: PosSettings = {
    ...published,
    connection: posSettingsFixture.connection
      ? { ...posSettingsFixture.connection, status: "disconnecting", revision: 3 }
      : null,
  };
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/admin/stores/tablecast-store/pos" && request.method === "DELETE") {
      deletes++;
      return deletes === 1
        ? Response.json({ error: { code: "POS_DISCONNECT_PENDING" } }, { status: 503 })
        : Response.json({ ...published, connection: null, mappings: [] });
    }
    if (path === "/api/admin/stores/tablecast-store/pos" && request.method === "GET") {
      settingsReads++;
      return Response.json(disconnecting);
    }
    unexpected.push(`${request.method} ${path}`);
    return Response.json({}, { status: 500 });
  });
  await render(
    providers(
      <StoreContext.Provider
        value={{
          id: "tablecast-store",
          name: "京都の店舗",
          role: "owner",
          organizationId: "tablecast-org",
          logo: null,
        }}
      >
        <StorePos />
      </StoreContext.Provider>,
    ),
  );
  await page.getByText(ja.pos_connection_settings, { exact: true }).click();
  const disconnect = page.getByRole("button", { name: ja.pos_disconnect, exact: true });
  await disconnect.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.pos_disconnect, exact: true })
    .click();
  await expect.element(page.getByText(ja.pos_disconnecting, { exact: true })).toBeVisible();
  await expect.element(page.getByText(ja.pos_disconnect_pending_hint)).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ja.pos_connect, exact: true }))
    .toBeDisabled();
  await expect
    .element(page.getByRole("button", { name: ja.common_save, exact: true }))
    .toBeDisabled();
  await expect.element(disconnect).toBeEnabled();
  expect(settingsReads).toBe(1);
  await disconnect.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.pos_disconnect, exact: true })
    .click();
  await expect.element(page.getByText(ja.pos_disconnected, { exact: true }).first()).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ja.pos_connect, exact: true }))
    .toBeEnabled();
  await expect.element(disconnect).not.toBeInTheDocument();
  expect(deletes).toBe(2);
});

function MappingLocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale(locale === "ja" ? "en" : "ja")}>
      {locale === "ja" ? "English" : "日本語"}
    </button>
  );
}
it("商品と選択肢の名前を管理言語へ切り替えても入力中のSquare対応付けを保持する", async () => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    unexpected.push(new Request(input, init).url);
    return Response.json({}, { status: 500 });
  });
  await render(
    providers(
      <>
        <MappingLocaleSwitcher />
        <StorePosSettings storeId="tablecast-store" canEdit settings={posSettingsFixture} />
      </>,
    ),
  );
  await expect
    .element(page.getByRole("combobox", { name: `煎茶 · ${ja.pos_mapping_product}` }))
    .toBeVisible();
  await page
    .getByRole("combobox", { name: `煎茶 · 大きめ · ${ja.pos_mapping_option}` })
    .selectOptions("tablecast-square-large");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect.element(page.getByRole("searchbox", { name: en.pos_mapping_search })).toBeVisible();
  await expect
    .element(
      page.getByRole("button", { name: new RegExp(`^${en.pos_mapping_filter_mapped}\\s*2$`) }),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: `Green tea · ${en.pos_mapping_product}` }))
    .toBeVisible();
  expect(
    page
      .getByRole("combobox", { name: `Green tea · ${en.pos_mapping_product}` })
      .element()
      .querySelector("option:checked")?.textContent,
  ).toContain("煎茶（店内）");
  await expect.element(page.getByText("Large", { exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: `Green tea · Large · ${en.pos_mapping_option}` }))
    .toHaveValue("tablecast-square-large");
  expect(
    page
      .getByRole("combobox", { name: `Green tea · Large · ${en.pos_mapping_option}` })
      .element()
      .querySelector("option:checked")?.textContent,
  ).toContain("大盛り");
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect
    .element(page.getByRole("combobox", { name: `煎茶 · ${ja.pos_mapping_product}` }))
    .toBeVisible();
  await expect
    .element(page.getByRole("combobox", { name: `煎茶 · 大きめ · ${ja.pos_mapping_option}` }))
    .toHaveValue("tablecast-square-large");
});

it("客の卓が日本語でも管理者の英語設定でPOSの商品名と選択肢を表示する", async () => {
  const invoice = posCheckoutFixture.invoice;
  if (!invoice) throw new Error("会計fixtureがありません");
  client.setQueryData(posCheckoutOptions("tablecast-store", "tablecast-session").queryKey, {
    ...posCheckoutFixture,
    invoice: {
      ...invoice,
      lines: invoice.lines.map((line) => ({
        ...line,
        name: "煎茶",
        displayName: { ja: "煎茶", en: "Green tea" },
        options: line.options.map((option) => ({
          ...option,
          name: "大きめ",
          displayName: { ja: "大きめ", en: "Large" },
        })),
      })),
    },
  });
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    unexpected.push(new Request(input, init).url);
    return Response.json({}, { status: 500 });
  });
  await render(
    providers(<PosCheckout storeId="tablecast-store" sessionId="tablecast-session" />, "en"),
  );
  await page.getByText(en.pos_details, { exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "Green tea", exact: true })).toBeVisible();
  await expect.element(page.getByText("Large", { exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: "煎茶", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(page.getByText("大きめ", { exact: true })).not.toBeInTheDocument();
});
