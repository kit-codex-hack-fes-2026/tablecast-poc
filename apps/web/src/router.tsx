import { createRouter } from "@tanstack/react-router";
import { parseFlatSearch, stringifyFlatSearch } from "./lib/router-search";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    parseSearch: parseFlatSearch,
    stringifySearch: stringifyFlatSearch,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
