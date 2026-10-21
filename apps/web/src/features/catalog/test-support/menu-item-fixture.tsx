import { type ConfigDraft } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { catalog, product } from "../../../../.storybook/tablecast-fixtures";
import { DocumentHead } from "../../../components/document-head";
import { MotionProvider } from "../../../components/motion-provider";
import { LocaleProvider } from "../../../i18n/locale";
import { sessionOptions } from "../../../lib/session-query";
import "../../../styles.css";
import { menuDocument } from "../../configuration/menu-model";
import { draftOptions } from "../../configuration/menu-query";
import { storesOptions } from "../../store/store-query";
import { StoreShell } from "../../store/store-shell";
import { catalogOptions } from "../catalog-query";
import { MenuItem } from "../menu-item";

export const storeId = "tablecast-story";

export const draftId = "tablecast-image-draft";

export const png = new File(
  [
    Uint8Array.fromBase64(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    ),
  ],
  "tablecast-photo.png",
  { type: "image/png" },
);

let client: QueryClient;

let restoreHistory: (() => void) | undefined;

let initialViewport: { height: number; width: number };

beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});

afterEach(async () => {
  try {
    await cleanup();
    restoreHistory?.();
    client.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

export async function mountForm(
  locale: "en" | "ja" = "ja",
  configuration = catalog.configuration,
  itemId = product.id,
) {
  const initial: ConfigDraft = {
    id: draftId,
    storeId,
    version: 1,
    baseVersion: 1,
    status: "draft",
    configuration: structuredClone(configuration),
    errors: [],
    changes: [],
    createdAt: 1,
    updatedAt: 1,
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(catalogOptions(storeId).queryKey, { ...catalog, storeId });
  client.setQueryData(draftOptions(storeId, draftId).queryKey, initial);
  client.setQueryData(storesOptions.queryKey, {
    locale,
    stores: [
      {
        id: storeId,
        name: "画像検証店舗",
        logo: null,
        organizationId: "tablecast-images-org",
        role: "owner",
      },
    ],
  });
  client.setQueryData(sessionOptions.queryKey, null);
  const root = createRootRoute({
    component: () => (
      <>
        <DocumentHead />
        <Outlet />
      </>
    ),
  });
  const storeRoute = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId={storeId} />,
  });
  const edit = createRoute({
    getParentRoute: () => storeRoute,
    path: "menu/changes/$draftId/products/$itemId",
    loader: async () => ({
      document: menuDocument(
        (await client.ensureQueryData(draftOptions(storeId, draftId))).configuration,
        "products",
        itemId,
      ),
    }),
    component: () => <MenuItem section="products" itemId={itemId} draftId={draftId} />,
  });
  const list = createRoute({
    getParentRoute: () => storeRoute,
    path: "menu/changes/$draftId/products",
    component: () => <h1>商品一覧へ移動済み</h1>,
  });
  const previousUrl = window.location.href;
  const previousState: unknown = window.history.state;
  window.history.replaceState(
    null,
    "",
    `/admin/stores/${storeId}/menu/changes/${draftId}/products/${itemId}`,
  );
  const history = createBrowserHistory();
  restoreHistory = () => {
    history.destroy();
    window.history.replaceState(previousState, "", previousUrl);
  };
  const router = createRouter({
    routeTree: root.addChildren([storeRoute.addChildren([edit, list])]),
    history,
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return initial;
}
