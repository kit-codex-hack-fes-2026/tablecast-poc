import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useState } from "react";
import { LocaleProvider } from "../i18n/locale";
import { getLocale } from "../paraglide/runtime.js";
import stylesheet from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TableCast" },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: Root,
  notFoundComponent: () => (
    <main className="empty-page">
      <h1>404</h1>
      <a href="/">TableCast</a>
    </main>
  ),
});

function Root() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 3_000 } } }),
  );
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <LocaleProvider>
            <Outlet />
          </LocaleProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
