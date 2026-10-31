import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export function integrationConnection(origin: string) {
  return {
    name: "tablecast",
    endpoint: `${origin}/mcp`,
  };
}

export const readIntegrationConnection = createIsomorphicFn()
  .server(() => {
    return integrationConnection(new URL(getRequest().url).origin);
  })
  .client(() => integrationConnection(window.location.origin));
