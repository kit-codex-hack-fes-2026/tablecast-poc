import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { Pairing } from "./pairing";

let initialViewport: { height: number; width: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

test.each([
  { locale: "ja", labels: ja, width: 1280 },
  { locale: "ja", labels: ja, width: 390 },
] as const)(
  "$width pxの評価入口はデモを優先し端末接続をキーボードで開ける",
  async ({ locale, labels, width }) => {
    await page.viewport(width, 900);
    const root = createRootRoute();
    const route = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => <Pairing evaluation onReady={() => undefined} />,
    });
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <RouterProvider router={router} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toMatchTextContent(labels.evaluation_title);
    await expect
      .element(page.getByRole("link", { name: labels.evaluation_start }))
      .toHaveAttribute("href", "/login?returnTo=%2Fadmin%2Fstores%2Ftablecast-komorebi%2Fdemo");
    await expect.element(page.getByText(labels.pair_begin, { exact: true })).not.toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await page.viewport(width, document.body.scrollHeight);

    const disclosure = page.getByText(labels.evaluation_device);
    disclosure.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: labels.pair_begin })).toBeVisible();
  },
);
