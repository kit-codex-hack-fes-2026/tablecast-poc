import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
  useMatchRoute,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Brand } from "../components/brand";
import { DocumentHead } from "../components/document-head";
import { MotionProvider } from "../components/motion-provider";
import { Pwa } from "../components/pwa";
import { RouteMotion } from "../components/route-motion";
import { catalogOptions } from "../features/catalog/catalog-query";
import { menuSectionSchema } from "../features/configuration/menu-model";
import { floorOptions } from "../features/floor/floor-query";
import { homeOptions } from "../features/store/home-query";
import { storesOptions } from "../features/store/store-query";
import { LocaleProvider } from "../i18n/locale";
import { initialStorePath } from "../lib/initial-store-path";
import { PanelLayoutProvider } from "../lib/panel-layout";
import { loadInitial, sessionOptions } from "../lib/session-query";
import { readPanelCookies } from "../lib/use-panel-layout";
import { getLocale } from "../paraglide/runtime.js";
import stylesheet from "../styles.css?url";

const PasskeyPrompt = lazy(() =>
  import("../features/account/passkey-setup").then((module) => ({ default: module.PasskeyPrompt })),
);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location, abortController }) => {
    const panelCookies = await readPanelCookies();
    let promptPasskey = false;
    if (
      /^\/(admin|account|billing|organisations|stores|device|consent|invitations|member|passkey-setup)(\/|$)/.test(
        location.pathname,
      )
    ) {
      const { queryClient } = context;
      if (/^\/(member|passkey-setup)(\/|$)/.test(location.pathname)) {
        await queryClient.ensureQueryData(sessionOptions);
      } else if (
        queryClient.getQueryData(sessionOptions.queryKey) === undefined ||
        queryClient.getQueryData(storesOptions.queryKey) === undefined
      ) {
        const storePath = initialStorePath(location.pathname);
        const menuMatch = /^\/admin\/stores\/([^/]+)\/menu\/([^/]+)\/?$/.exec(location.pathname);
        const catalogStoreId =
          menuMatch?.[1] && menuSectionSchema.safeParse(menuMatch[2]).success
            ? decodeURIComponent(menuMatch[1])
            : undefined;
        const storeId = storePath?.storeId ?? catalogStoreId;
        const search = new URLSearchParams(location.searchStr);
        // SSRの転送先は別のQueryClientになるため、ホームでも使うフロアの先読みはクライアントだけで行う。
        const defaultFloor =
          typeof window !== "undefined" &&
          location.pathname === "/admin/live" &&
          !search.has("storeId") &&
          !search.has("section") &&
          !search.has("draftId");
        const initial = await loadInitial(
          storeId,
          defaultFloor ? "true" : undefined,
          catalogStoreId ? "catalog" : storePath?.home || defaultFloor ? "home" : undefined,
          abortController.signal,
        );
        queryClient.setQueryData(sessionOptions.queryKey, initial.session);
        queryClient.setQueryData(storesOptions.queryKey, {
          stores: initial.stores,
          locale: initial.session?.user.locale ?? "ja",
        });
        if (initial.floor) {
          queryClient.setQueryData(floorOptions(initial.floor.store.id).queryKey, initial.floor);
        }
        if (initial.home)
          queryClient.setQueryData(homeOptions(initial.home.storeId).queryKey, initial.home);
        if (initial.catalog) {
          queryClient.setQueryData(
            catalogOptions(initial.catalog.storeId).queryKey,
            initial.catalog,
          );
        }
      }
      const session = queryClient.getQueryData(sessionOptions.queryKey);
      if (!session) throw redirect({ to: "/login", search: { returnTo: location.href } });
      promptPasskey = location.pathname !== "/passkey-setup" && !session.user.passkeyRegistered;
    }
    return { panelCookies, promptPasskey };
  },
  head: ({ matches }) => {
    const pathname = matches.at(-1)?.pathname ?? "";
    const store = /^\/member\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
    const memberStore = store && store !== "join" ? store : undefined;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#f7f7f2" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
      ],
      links: [
        { rel: "stylesheet", href: stylesheet },
        {
          rel: "manifest",
          href: matches.at(-1)?.pathname.startsWith("/member")
            ? memberStore
              ? `/api/member-stores/${memberStore}/manifest.webmanifest`
              : "/tablecast-customer.webmanifest"
            : matches.at(-1)?.pathname === "/"
              ? "/tablecast-kiosk.webmanifest"
              : "/tablecast-staff.webmanifest",
        },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
        ...[180, 167, 152].map((size) => ({
          rel: "apple-touch-icon",
          href: memberStore
            ? `/api/member-stores/${memberStore}/icon?width=${size}`
            : `/icons/tablecast-${size}.png`,
          sizes: `${size}x${size}`,
        })),
      ],
    };
  },
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
  const help = matchRoute({ to: "/help/$lang/$" });
  const helpLocale = help && (help.lang === "ja" || help.lang === "en") ? help.lang : undefined;
  const demo = matchRoute({ to: "/admin/stores/$storeId/demo/$demoId" });
  return (
    <html lang={helpLocale ?? getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <LocaleProvider
          key={helpLocale ? `help:${helpLocale}` : demo ? `${demo.storeId}/${demo.demoId}` : "app"}
          initialLocale={helpLocale}
          persist={!demo && !helpLocale}
        >
          <DocumentHead />
          <MotionProvider>{children}</MotionProvider>
        </LocaleProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootContent() {
  const { panelCookies, promptPasskey } = Route.useRouteContext();
  return (
    <PanelLayoutProvider cookies={panelCookies}>
      <RouteMotion />
      <Pwa />
      <Outlet />
      {promptPasskey && (
        <Suspense fallback={null}>
          <PasskeyPrompt />
        </Suspense>
      )}
    </PanelLayoutProvider>
  );
}
