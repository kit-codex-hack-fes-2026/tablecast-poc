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
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { storesOptions } from "../features/store/store-query";
import { LocaleProvider } from "../i18n/locale";
import { sessionOptions } from "../lib/session-query";
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
      const session = await context.queryClient.ensureQueryData(sessionOptions);
      if (!session) throw redirect({ to: "/login", search: { returnTo: location.href } });
      await context.queryClient.ensureQueryData(storesOptions);
    }
    return { panelCookies };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TableCast" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  shellComponent: Root,
  component: RootContent,
  notFoundComponent: () => (
    <main className="min-h-dvh flex justify-center items-center flex-col gap-7 p-8 text-center">
      <h1>404</h1>
      <a href="/">TableCast</a>
    </main>
  ),
});

function Root({ children }: { children: ReactNode }) {
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <LocaleProvider>
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
      <Outlet />
    </PanelLayoutProvider>
  );
}
