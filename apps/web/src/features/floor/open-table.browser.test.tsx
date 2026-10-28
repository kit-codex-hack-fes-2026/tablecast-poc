import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { catalog } from "../../test-support/tablecast-fixtures";
import "../../styles.css";
import { catalogOptions } from "../catalog/catalog-query";
import { OpenTable } from "./open-table";

let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(1024, 768);
});

it("接客言語は旗と名称で選び、矢印キーによる変更を開始時に送信する", async () => {
  await page.viewport(390, 844);
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/tables/open"))
      throw new Error(`未定義の要求: ${request.method} ${new URL(request.url).pathname}`);
    requests.push(await request.json());
    return Response.json({});
  });
  const onOpened = vi.fn<() => void>();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(catalogOptions("tablecast-store").queryKey, catalog);
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <MotionProvider>
          <OpenTable
            storeId="tablecast-store"
            table={{ id: "tablecast-table", name: "窓際の卓" }}
            onOpened={onOpened}
          />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  const japanese = page.getByRole("radio", { name: "日本語", exact: true });
  await expect.element(japanese).toBeChecked();
  japanese.element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(page.getByRole("radio", { name: "English", exact: true })).toBeChecked();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  await page.screenshot({
    path: "../../../test-results/tablecast-language-selection.png",
    fullPage: true,
  });
  await userEvent.click(page.getByRole("button", { name: "ご利用を開始" }));
  await expect
    .poll(() => requests)
    .toEqual([{ tableId: "tablecast-table", guestCount: 2, locale: "en" }]);
  await expect.poll(() => onOpened.mock.calls.length).toBe(1);
});
