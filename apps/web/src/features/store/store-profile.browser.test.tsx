import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { StoreProfile } from "./store-profile";
import { StoreShell } from "./store-shell";

let client: QueryClient;
let unexpected: string[];
let initialViewport: { height: number; width: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
    if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

it("店舗画像を送信すると設定と店舗選択を再取得し、再表示でも同じ保存画像を使う", async () => {
  await page.viewport(1280, 900);
  const storeId = "tablecast-profile-store";
  let logo = "/icons/tablecast-180.png";
  const store = () => ({
    id: storeId,
    name: "画像のある店舗",
    logo,
    role: "owner",
    organizationId: "tablecast-org",
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], { stores: [store()] });
  unexpected = [];
  let uploaded: File | undefined;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
    if (path === "/api/admin/stores") return Response.json({ stores: [store()] });
    if (path === `/api/admin/stores/${storeId}/icon` && request.method === "POST") {
      const image = (await request.formData()).get("image");
      if (image instanceof File) uploaded = image;
      logo = "/icons/tablecast-512.png";
      return Response.json({ url: logo });
    }
    unexpected.push(`${request.method} ${path}`);
    return Response.json({}, { status: 500 });
  });
  const root = createRootRoute({ component: Outlet });
  const storeRoute = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId={storeId} />,
  });
  const profile = createRoute({
    getParentRoute: () => storeRoute,
    path: "profile",
    component: StoreProfile,
  });
  const router = createRouter({
    routeTree: root.addChildren([storeRoute.addChildren([profile])]),
    history: createMemoryHistory({ initialEntries: [`/admin/stores/${storeId}/profile`] }),
  });
  const view = () => (
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>
  );
  const screen = await render(view());
  await expect
    .element(screen.getByRole("heading", { name: ja.store_profile, exact: true }))
    .toBeVisible();
  const input = screen.getByLabelText(ja.store_icon_change);
  const image = Uint8Array.fromBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  );
  await input.upload(new File([image], "tablecast-icon.png", { type: "image/png" }));
  await expect.element(screen.getByRole("status")).toMatchTextContent(ja.account_saved);
  expect(uploaded?.name).toBe("tablecast-icon.png");
  expect(uploaded?.type).toBe("image/png");
  await expect
    .poll(() =>
      screen
        .getByRole("combobox", { name: ja.stores_title, exact: true })
        .element()
        .querySelector("img")
        ?.getAttribute("src"),
    )
    .toBe(logo);
  const region = screen.getByRole("region", { name: ja.editor_images, exact: true });
  await expect.poll(() => region.element().querySelector("img")?.getAttribute("src")).toBe(logo);
  await expect
    .poll(() => {
      const displayed = region.element().querySelector("img");
      return Boolean(displayed?.complete && displayed.naturalWidth > 0);
    })
    .toBe(true);
  await cleanup();
  const reopened = await render(view());
  await expect
    .poll(() =>
      reopened
        .getByRole("region", { name: ja.editor_images, exact: true })
        .element()
        .querySelector("img")
        ?.getAttribute("src"),
    )
    .toBe(logo);
});
