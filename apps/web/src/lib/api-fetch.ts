import { createIsomorphicFn } from "@tanstack/react-start";

export const apiFetch = createIsomorphicFn()
  .server(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { serverApiFetch } = await import("./api-fetch.server");
    return serverApiFetch(input, init);
  })
  .client((input, init) => fetch(input, { ...init, credentials: "same-origin" }));
