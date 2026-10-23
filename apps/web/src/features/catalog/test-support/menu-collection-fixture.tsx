import type { Catalog, ConfigDraft, Locale } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { catalog } from "../../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../../i18n/locale";
import "../../../styles.css";
import { DraftPage } from "../../configuration/configuration-draft-page";
import { ConfigurationHeader } from "../../configuration/configuration-header";
import { ConfigurationToolbarProvider } from "../../configuration/configuration-toolbar";
import {
  menuListSearchSchema,
  menuReviewSearchSchema,
  menuSectionSchema,
} from "../../configuration/menu-model";
import { draftOptions } from "../../configuration/menu-query";
import { catalogOptions } from "../catalog-query";
import { MenuCollection } from "../menu-collection";
import { MenuItem } from "../menu-item";
import { MenuOverview } from "../menu-overview";

let storeRole = "member";

let client: QueryClient;

let initialViewport: { height: number; width: number };

beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});

afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
    storeRole = "member";
    vi.restoreAllMocks();
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

function ConfigurationShell() {
  return (
    <ConfigurationToolbarProvider>
      <ConfigurationHeader storeId={catalog.storeId} role={storeRole} />
      <Outlet />
    </ConfigurationToolbarProvider>
  );
}

export async function showMenu(
  value: Catalog | undefined,
  locale: Locale = "ja",
  path = "/admin/stores/tablecast-story/menu/products",
  draftStatus: ConfigDraft["status"] = "published",
  withConfigurationShell = false,
) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  if (value) client.setQueryData(catalogOptions(value.storeId).queryKey, value);
  if (value)
    client.setQueryData(draftOptions(value.storeId, "tablecast-published-draft").queryKey, {
      id: "tablecast-published-draft",
      storeId: value.storeId,
      version: 2,
      baseVersion: 1,
      status: draftStatus,
      configuration: value.configuration,
      errors: [],
      changes: [],
      createdAt: 1,
      updatedAt: 2,
    } satisfies ConfigDraft);
  const root = createRootRoute({
    component: withConfigurationShell ? ConfigurationShell : Outlet,
  });
  const list = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/$section",
    validateSearch: menuListSearchSchema,
    params: {
      parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }),
    },
    component: function Collection() {
      return <MenuCollection section={list.useParams().section} search={list.useSearch()} />;
    },
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/$section/$itemId",
    validateSearch: menuListSearchSchema,
    params: {
      parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }),
    },
    component: function Overview() {
      const { section, itemId } = detail.useParams();
      return (
        <MenuOverview
          configuration={(value ?? catalog).configuration}
          section={section}
          itemId={itemId}
          search={detail.useSearch()}
        />
      );
    },
  });
  const review = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/changes/$draftId",
    validateSearch: menuReviewSearchSchema,
    component: function Review() {
      return <DraftPage draftId={review.useParams().draftId} search={review.useSearch()} />;
    },
  });
  const draftList = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/changes/$draftId/$section",
    validateSearch: menuListSearchSchema,
    params: {
      parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }),
    },
    component: function DraftCollection() {
      const { section, draftId } = draftList.useParams();
      return <MenuCollection section={section} draftId={draftId} search={draftList.useSearch()} />;
    },
  });
  const draftDetail = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
    validateSearch: menuListSearchSchema,
    params: {
      parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }),
    },
    component: function DraftItem() {
      const { section, draftId, itemId } = draftDetail.useParams();
      return (
        <MenuItem
          section={section}
          draftId={draftId}
          itemId={itemId}
          search={draftDetail.useSearch()}
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([list, detail, review, draftList, draftDetail]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <main className="space-y-6 p-6">
          <RouterProvider router={router} />
        </main>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { screen, router };
}

export const fixture = {
  get client() {
    return client;
  },
  set client(value: typeof client) {
    client = value;
  },
  get storeRole() {
    return storeRole;
  },
  set storeRole(value: typeof storeRole) {
    storeRole = value;
  },
};
