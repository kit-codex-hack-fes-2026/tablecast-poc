import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { RouteError, RoutePending } from "./components/route-state";
import { routeMotionDirection, supportsPageTransition } from "./lib/route-motion";
import { parseFlatSearch, stringifyFlatSearch } from "./lib/router-search";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const router = createRouter({
    context: { queryClient },
    defaultViewTransition: supportsPageTransition()
      ? {
          types: (event) => {
            const direction = routeMotionDirection(event);
            return direction ? [direction < 0 ? "tablecast-back" : "tablecast-forward"] : false;
          },
        }
      : false,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    routeTree,
    scrollRestoration: true,
    scrollToTopSelectors: ["#tablecast-admin-main"],
    parseSearch: parseFlatSearch,
    stringifySearch: stringifyFlatSearch,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
