import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { parseFlatSearch, stringifyFlatSearch } from "../../lib/router-search";
import { type loadInitial, sessionOptions } from "../../lib/session-query";
import "../../styles.css";
import { storesOptions } from "../store/store-query";
import { Consent } from "./consent";

let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "店舗選択済み=%sでも検索・再読込後に選択先を明示し、正しい対象と署名付きqueryを送る",
  async (active) => {
    const raw =
      "client_id=tablecast%2Ftest&scope=tablecast%3Aread%20tablecast%3Awrite&exp=0001785726000&sig=A%2fb%2Bz%3D&ba_param=client_id&ba_param=exp";
    const payloads: unknown[] = [];
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const session: NonNullable<Awaited<ReturnType<typeof loadInitial>>["session"]> = {
      user: {
        id: "tablecast-user",
        name: "接続確認",
        email: "owner@example.test",
        emailVerified: true,
        passkeyRegistered: true,
        locale: "ja",
        image: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
      session: {
        id: "tablecast-session",
        userId: "tablecast-user",
        token: "test",
        ipAddress: null,
        userAgent: null,
        activeOrganizationId: active ? "tablecast-org" : undefined,
        expiresAt: new Date("2099-01-01").toISOString(),
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    };
    client.setQueryData(sessionOptions.queryKey, session);
    client.setQueryData(storesOptions.queryKey, {
      stores: [
        {
          id: "tablecast-store",
          organizationId: "tablecast-org",
          name: "こもれび",
          role: "owner",
          logo: null,
        },
        {
          id: "tablecast-second",
          organizationId: "tablecast-org-second",
          name: "みなと",
          role: "owner",
          logo: null,
        },
      ],
      locale: "ja",
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (
        ["/api/auth/oauth2/consent", "/api/auth/organization/set-active"].includes(
          new URL(request.url).pathname,
        )
      ) {
        payloads.push(await request.json());
        return Response.json({ redirect: false });
      }
      if (new URL(request.url).pathname === "/api/account/auth-state")
        return Response.json(session);
      throw new Error(`未定義の要求: ${request.method} ${new URL(request.url).pathname}`);
    });
    const root = createRootRoute();
    const route = createRoute({
      getParentRoute: () => root,
      path: "/consent",
      component: Consent,
    });
    const makeRouter = (entry: string) =>
      createRouter({
        routeTree: root.addChildren([route]),
        history: createMemoryHistory({ initialEntries: [entry] }),
        parseSearch: parseFlatSearch,
        stringifySearch: stringifyFlatSearch,
      });
    let router = makeRouter(`/consent?${raw}`);
    const show = async () =>
      render(
        <QueryClientProvider client={client}>
          <LocaleProvider initialLocale="ja" persist={false}>
            <MotionProvider>
              <RouterProvider router={router} />
            </MotionProvider>
          </LocaleProvider>
        </QueryClientProvider>,
      );
    await show();
    expect(router.state.location.searchStr).toBe(`?${raw}`);
    const search = page.getByRole("searchbox", { name: "店舗名で検索" });
    await search.fill("みなと");
    await expect
      .element(page.getByRole("group", { name: "選択中", exact: true }))
      .toMatchTextContent("こもれび");
    await expect
      .element(page.getByRole("row").filter({ hasText: "こもれび" }))
      .not.toBeInTheDocument();
    await page.getByRole("combobox", { name: "並び順" }).click();
    await page.getByRole("option", { name: "降順", exact: true }).click();
    await expect
      .poll(() => router.state.location.searchStr)
      .toBe(`?${raw}&consentStoresQ=${encodeURIComponent("みなと")}&consentStoresSort=name%3Adesc`);
    const restoredUrl = router.state.location.href;
    await cleanup();
    router = makeRouter(restoredUrl);
    await show();
    await expect
      .element(page.getByRole("searchbox", { name: "店舗名で検索" }))
      .toHaveValue("みなと");
    await expect
      .element(page.getByRole("combobox", { name: "並べ替え対象" }))
      .toHaveTextContent("店舗名");
    await page.getByRole("button", { name: "リセット", exact: true }).click();
    await expect.poll(() => router.state.location.searchStr).toBe(`?${raw}`);
    router.history.back();
    await expect
      .element(page.getByRole("searchbox", { name: "店舗名で検索" }))
      .toHaveValue("みなと");
    await expect
      .element(page.getByRole("group", { name: "選択中", exact: true }))
      .toMatchTextContent("こもれび");
    await page.getByRole("button", { name: active ? "接続を許可" : "続ける", exact: true }).click();
    await expect
      .poll(() => payloads)
      .toEqual([active ? { accept: true, oauth_query: raw } : { organizationId: "tablecast-org" }]);
  },
);
