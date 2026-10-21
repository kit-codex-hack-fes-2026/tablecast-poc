import { type ConfigDraft, type Demo, demoUpdateSchema } from "@tablecast/api/schema";
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
import { z } from "zod";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { catalogOptions } from "../catalog/catalog-query";
import { draftsOptions } from "../configuration/drafts-query";
import { DemoPage } from "./demo";
import { demoOptions } from "./demo-query";

let client: QueryClient;
let unexpected: string[];
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});

it("日本語で設定更新を明示反映し、不正下書き・人数変更・確認前のリセットを区別する", async () => {
  const locale = "ja";
  const labels = ja;
  const storeId = catalog.storeId;
  const demoId = "tablecast-browser-demo";
  const api = `/api/admin/stores/${storeId}`;
  let current: Demo = {
    id: demoId,
    sourceDraftId: null,
    sourceVersion: 1,
    version: 1,
    configuration: structuredClone(catalog.configuration),
    planId: null,
    guestCount: 1,
  };
  const draft = {
    id: "valid-tablecast-draft",
    storeId,
    baseVersion: 1,
    version: 3,
    status: "draft",
    configuration: structuredClone(catalog.configuration),
    changes: [],
    errors: [],
    createdAt: 1,
    updatedAt: 2,
  } satisfies ConfigDraft;
  const invalid = { ...draft, id: "invalid-tablecast-draft", createdAt: Date.UTC(2026, 9, 20) };
  const updates: unknown[] = [];
  let resets = 0;
  const resetInputs: unknown[] = [];
  const pending = Promise.withResolvers<void>();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(demoOptions(storeId, demoId).queryKey, current);
  client.setQueryData(catalogOptions(storeId).queryKey, { ...catalog, version: 1 });
  client.setQueryData(draftsOptions(storeId).queryKey, { drafts: [draft, invalid] });
  client.setQueryData(["tablecast-stores"], { stores: [] });
  unexpected = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === `${api}/demo/${demoId}` && request.method === "GET") return Response.json(current);
    if (path === `${api}/catalog`) return Response.json({ ...catalog, version: 2 });
    if (path === `${api}/drafts`) return Response.json({ drafts: [draft, invalid] });
    if (path === "/api/admin/stores") return Response.json({ stores: [] });
    if (path === `${api}/demo/${demoId}` && request.method === "PATCH") {
      const updateInput = demoUpdateSchema.parse(await request.json());
      updates.push(updateInput);
      if (updateInput.sourceDraftId === invalid.id)
        return Response.json(
          {
            error: {
              code: "CONFIGURATION_INVALID",
              details: [
                {
                  code: "CATEGORY_NOT_FOUND",
                  path: ["products", 0, "categoryId"],
                  params: { categoryId: "tablecast-missing" },
                },
              ],
            },
          },
          { status: 422 },
        );
      if (updateInput.guestCount) await pending.promise;
      current = {
        ...current,
        version: current.version + 1,
        guestCount: updateInput.guestCount ?? current.guestCount,
        sourceDraftId:
          updateInput.sourceDraftId === undefined
            ? current.sourceDraftId
            : updateInput.sourceDraftId,
        sourceVersion: updateInput.reload
          ? 2
          : updateInput.sourceDraftId === draft.id
            ? draft.version
            : current.sourceVersion,
      };
      return Response.json(current);
    }
    if (path === `${api}/demo/${demoId}/reset`) {
      resetInputs.push(await request.json());
      resets++;
      current = { ...current, version: current.version + 1 };
      return Response.json(current);
    }
    unexpected.push(`${request.method} ${path}`);
    return Response.json({}, { status: 500 });
  });
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/demo",
    validateSearch: z.object({
      demoId: z.string(),
      device: z.enum(["browser", "ipad", "ipad-air-11", "ipad-air-13"]).optional(),
      portrait: z.boolean().optional(),
    }),
  });
  route.update({
    component: function Session() {
      const search = route.useSearch<typeof router>();
      return (
        <DemoPage
          storeId={storeId}
          demoId={search.demoId}
          device={search.device}
          portrait={search.portrait}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: [`/admin/stores/${storeId}/demo?demoId=${demoId}`],
    }),
  });
  try {
    const screen = await render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <RouterProvider router={router} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    const iframe = document.querySelector("iframe");
    await expect
      .element(screen.getByRole("button", { name: labels.demo_reload, exact: true }))
      .toBeDisabled();
    client.setQueryData(catalogOptions(storeId).queryKey, { ...catalog, version: 2 });
    await expect
      .element(screen.getByRole("button", { name: labels.demo_reload, exact: true }))
      .toBeEnabled();
    expect(updates).toEqual([]);
    await screen.getByRole("button", { name: labels.demo_reload, exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: labels.demo_reload, exact: true }))
      .toBeDisabled();
    expect(updates).toEqual([{ expectedVersion: 1, reload: true }]);
    await screen.getByRole("combobox", { name: labels.demo_configuration }).click();
    await screen.getByRole("option", { name: /2026年10月20日/ }).click();
    await expect
      .element(screen.getByRole("list", { name: labels.config_error_list }))
      .toMatchTextContent(labels.config_error_category_missing);
    await expect
      .element(screen.getByRole("combobox", { name: labels.demo_configuration }))
      .toMatchTextContent(labels.demo_published);
    await screen.getByRole("combobox", { name: labels.demo_configuration }).click();
    await screen.getByRole("option", { name: /1970年1月1日/ }).click();
    await expect
      .element(screen.getByRole("combobox", { name: labels.demo_configuration }))
      .toMatchTextContent("1970年1月1日(木)");
    await screen.getByRole("combobox", { name: labels.demo_guests }).click();
    await screen.getByRole("option", { name: "3", exact: true }).click();
    await expect.element(screen.getByRole("combobox", { name: labels.demo_guests })).toBeDisabled();
    pending.resolve();
    await expect.element(screen.getByRole("combobox", { name: labels.demo_guests })).toBeEnabled();
    await expect
      .element(screen.getByRole("combobox", { name: labels.demo_guests }))
      .toMatchTextContent("3");
    await screen.getByRole("button", { name: labels.demo_rotate, exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: labels.demo_rotate, exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("iframe")).toBe(iframe);
    expect(router.state.location.search).toMatchObject({
      demoId,
      device: "ipad",
      portrait: true,
    });
    await screen.getByRole("button", { name: labels.demo_reset, exact: true }).click();
    expect(resets).toBe(0);
    const resetVersion = current.version;
    await screen
      .getByRole("alertdialog")
      .getByRole("button", { name: labels.demo_reset, exact: true })
      .click();
    await expect.poll(() => resets).toBe(1);
    expect(resetInputs).toEqual([{ expectedVersion: resetVersion, approved: true }]);
  } finally {
    pending.resolve();
    await expect.poll(() => client.isMutating()).toBe(0);
  }
});
