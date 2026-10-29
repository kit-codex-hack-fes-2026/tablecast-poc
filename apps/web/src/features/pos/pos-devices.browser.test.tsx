import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup } from "vitest-browser-react";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { posCatalogOptions, posDevicesOptions } from "./pos-query";
import { StorePosSettings } from "./store-pos";
import {
  posCatalogFixture,
  posDevicesFixture,
  posSettingsFixture,
} from "./test-support/pos-fixture";
import { renderPos as render } from "./test-support/pos-render";

let client: QueryClient;
let unexpected: string[];
beforeEach(() => {
  unexpected = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(
    posCatalogOptions("tablecast-store", "tablecast-location").queryKey,
    posCatalogFixture,
  );
  client.setQueryData(
    posDevicesOptions("tablecast-store", "tablecast-location").queryKey,
    posDevicesFixture,
  );
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});
it("期限切れの端末接続コードを再発行し、接続確認後に端末を選択しても店舗設定を勝手に保存しない", async () => {
  let creates = 0;
  let paired = false;
  const keys: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const base = "/api/admin/stores/tablecast-store/pos/devices";
    if (path === base && request.method === "POST") {
      const body: unknown = await request.json();
      if (
        body &&
        typeof body === "object" &&
        "idempotencyKey" in body &&
        typeof body.idempotencyKey === "string"
      )
        keys.push(body.idempotencyKey);
      creates++;
      return Response.json({
        id: `tablecast-code-${creates}`,
        code: creates === 1 ? "111111" : "222222",
        status: "pending",
        deviceId: null,
        expiresAt: Date.now() + 300000,
      });
    }
    if (path === `${base}/tablecast-code-1` && request.method === "GET")
      return Response.json({
        id: "tablecast-code-1",
        code: "111111",
        status: "expired",
        deviceId: null,
        expiresAt: Date.now() - 1,
      });
    if (path === `${base}/tablecast-code-2` && request.method === "GET") {
      paired = true;
      return Response.json({
        id: "tablecast-code-2",
        code: "222222",
        status: "paired",
        deviceId: "tablecast-terminal-3",
        expiresAt: Date.now() + 300000,
      });
    }
    if (path === base && request.method === "GET")
      return Response.json({
        devices: [
          ...posDevicesFixture.devices,
          ...(paired
            ? [{ id: "tablecast-terminal-3", name: "持ち帰り", locationId: "tablecast-location" }]
            : []),
        ],
        canPair: true,
      });
    unexpected.push(`${request.method} ${path}`);
    return Response.json({}, { status: 500 });
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <MotionProvider>
          <main className="p-6">
            <StorePosSettings storeId="tablecast-store" canEdit settings={posSettingsFixture} />
          </main>
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  await page.getByText(ja.pos_connection_settings, { exact: true }).click();
  await page.getByRole("button", { name: ja.pos_device_add, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: ja.pos_device_name }).fill("持ち帰り");
  await dialog.getByRole("button", { name: ja.pos_device_generate }).click();
  await expect.element(dialog.getByText("111111", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: ja.pos_device_check }).click();
  await expect.element(dialog.getByText(ja.pos_device_expired)).toBeVisible();
  await expect.element(dialog.getByText("111111", { exact: true })).not.toBeInTheDocument();
  await dialog.getByRole("button", { name: ja.pos_device_generate }).click();
  await expect.element(dialog.getByText("222222", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: ja.pos_device_check }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("combobox", { name: ja.pos_device }))
    .toHaveValue("tablecast-terminal-3");
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toEqual(keys[1]);
});

it("店舗と端末の保存は営業時の接続設定だけを送り、下書きの商品対応を保存しない", async () => {
  let saved: unknown;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/admin/stores/tablecast-store/pos" && request.method === "PUT") {
      saved = await request.json();
      return Response.json({
        ...posSettingsFixture,
        connection: {
          ...posSettingsFixture.connection,
          deviceId: "tablecast-terminal-2",
          revision: 3,
        },
      });
    }
    unexpected.push(`${request.method} ${path}`);
    return Response.json({}, { status: 500 });
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <MotionProvider>
          <main className="p-6">
            <StorePosSettings storeId="tablecast-store" canEdit settings={posSettingsFixture} />
          </main>
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  await page.getByText(ja.pos_connection_settings, { exact: true }).click();
  await page.getByRole("combobox", { name: ja.pos_device }).selectOptions("tablecast-terminal-2");
  await page.getByRole("button", { name: ja.common_save, exact: true }).first().click();
  await expect.element(page.getByText(ja.pos_saved, { exact: true })).toBeVisible();
  expect(saved).toEqual({
    expectedRevision: 2,
    locationId: "tablecast-location",
    deviceId: "tablecast-terminal-2",
  });
});
