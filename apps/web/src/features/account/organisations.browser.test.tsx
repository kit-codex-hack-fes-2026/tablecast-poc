import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import { LocaleProvider } from "../../i18n/locale";
import { storesOptions, type loadStores } from "../store/store-query";
import { Organisations } from "./organisations";
import "../../styles.css";

vi.mock("../shell/settings-shell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => <main className="p-6">{children}</main>,
}));
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
});

it.each(["ja", "en"] as const)(
  "%sで店舗名からホームへ移動でき、対象別の設定とメンバー操作を保つ",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    const store = {
      id: "tablecast-komorebi",
      name: "こもれび",
      logo: null,
      role: "owner",
      organizationId: "tablecast-organisation",
    } satisfies Awaited<ReturnType<typeof loadStores>>["stores"][number];
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(storesOptions.queryKey, { stores: [store], locale });
    const root = createRootRoute();
    const collection = createRoute({
      getParentRoute: () => root,
      path: "/organisations",
      component: Organisations,
    });
    const home = createRoute({
      getParentRoute: () => root,
      path: "/admin/stores/$storeId",
      component: () => <h1>店舗ホーム</h1>,
    });
    const router = createRouter({
      routeTree: root.addChildren([collection, home]),
      history: createMemoryHistory({ initialEntries: ["/organisations"] }),
    });
    const screen = await render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <RouterProvider router={router} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    const identity = screen.getByRole("link", { name: store.name, exact: true });
    await expect.element(identity).toHaveAttribute("href", `/admin/stores/${store.id}`);
    expect(identity.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect
      .element(screen.getByRole("link", { name: labels.store_profile, exact: true }))
      .toHaveAttribute("href", `/admin/stores/${store.id}/profile`);
    await expect
      .element(screen.getByRole("link", { name: labels.org_members, exact: true }))
      .toHaveAttribute("href", `/admin/stores/${store.id}/members`);
    identity.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(screen.getByRole("heading", { name: "店舗ホーム", exact: true }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe(`/admin/stores/${store.id}`);
  },
);
