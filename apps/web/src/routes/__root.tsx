import { Brand } from "../components/brand";
import { Pwa, PwaInstallHelp } from "../components/pwa";
import { MotionProvider } from "../components/motion-provider";
import { readPanelCookies } from "../lib/use-panel-layout";
import { PanelLayoutProvider } from "../lib/panel-layout";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
  useMatchRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { floorOptions, storesOptions } from "../features/store/store-query";
import { catalogOptions } from "../features/store/menu-query";
import { menuSectionSchema } from "../features/store/menu-model";
import { LocaleProvider } from "../i18n/locale";
import { loadInitial, sessionOptions } from "../lib/session-query";
import { getLocale } from "../paraglide/runtime.js";
import stylesheet from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    const panelCookies = await readPanelCookies();
    if (
      /^\/(admin|account|organisations|stores|device|consent|invitations)(\/|$)/.test(
        location.pathname,
      )
    ) {
      const { queryClient } = context;
      if (
        queryClient.getQueryData(sessionOptions.queryKey) === undefined ||
        queryClient.getQueryData(storesOptions.queryKey) === undefined
      ) {
        const floorMatch = /^\/admin\/stores\/([^/]+)\/floor\/?$/.exec(location.pathname);
        const menuMatch = /^\/admin\/stores\/([^/]+)\/menu\/([^/]+)\/?$/.exec(location.pathname);
        const catalogStoreId =
          menuMatch && menuSectionSchema.safeParse(menuMatch[2]).success
            ? decodeURIComponent(menuMatch[1])
            : undefined;
        const storeId = floorMatch ? decodeURIComponent(floorMatch[1]) : catalogStoreId;
        const search = new URLSearchParams(location.searchStr);
        // SSRの転送先は別のQueryClientになるため、既定フロアの先読みはクライアントだけで行う。
        const defaultFloor =
          typeof window !== "undefined" &&
          location.pathname === "/admin/live" &&
          !search.has("storeId") &&
          !search.has("section") &&
          !search.has("draftId");
        const initial = await loadInitial(
          storeId,
          defaultFloor ? "true" : undefined,
          catalogStoreId ? "catalog" : undefined,
        );
        queryClient.setQueryData(sessionOptions.queryKey, initial.session);
        queryClient.setQueryData(storesOptions.queryKey, {
          stores: initial.stores,
          locale: initial.session?.user.locale ?? "ja",
        });
        if (initial.floor) {
          queryClient.setQueryData(floorOptions(initial.floor.store.id).queryKey, initial.floor);
        }
        if (initial.catalog) {
          queryClient.setQueryData(
            catalogOptions(initial.catalog.storeId).queryKey,
            initial.catalog,
          );
        }
      }
      const session = queryClient.getQueryData(sessionOptions.queryKey);
      if (!session) throw redirect({ to: "/login", search: { returnTo: location.href } });
    }
    return { panelCookies };
  },
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#f7f7f2" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { title: "TableCast" },
    ],
    links: [
      { rel: "stylesheet", href: stylesheet },
      {
        rel: "manifest",
        href: matches.at(-1)?.pathname.startsWith("/member")
          ? "/tablecast-customer.webmanifest"
          : matches.at(-1)?.pathname === "/"
            ? "/tablecast-kiosk.webmanifest"
            : "/tablecast-staff.webmanifest",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { rel: "apple-touch-icon", href: "/icons/tablecast-180.png", sizes: "180x180" },
      { rel: "apple-touch-icon", href: "/icons/tablecast-167.png", sizes: "167x167" },
      { rel: "apple-touch-icon", href: "/icons/tablecast-152.png", sizes: "152x152" },
    ],
  }),
  shellComponent: Root,
  component: RootContent,
  notFoundComponent: () => (
    <main className="min-h-dvh flex justify-center items-center flex-col gap-7 p-8 text-center">
      <h1>404</h1>
      <a href="/">
        <Brand />
      </a>
    </main>
  ),
});

function Root({ children }: { children: ReactNode }) {
  const matchRoute = useMatchRoute();
  const demo = matchRoute({ to: "/admin/stores/$storeId/demo/$demoId" });
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <LocaleProvider key={demo ? `${demo.storeId}/${demo.demoId}` : "app"} persist={!demo}>
          <MotionProvider>{children}</MotionProvider>
        </LocaleProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootContent() {
  const { panelCookies } = Route.useRouteContext();
  return (
    <PanelLayoutProvider cookies={panelCookies}>
      <Pwa />
      <Outlet />
      <PwaInstallHelp />
    </PanelLayoutProvider>
  );
}
