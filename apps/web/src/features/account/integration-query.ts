import { createIsomorphicFn } from "@tanstack/react-start";
import connection from "../../../../../plugins/tablecast/.mcp.json";

export function integrationConnection(origin: string) {
  const staging = origin === "https://tablecast-staging.kit-codex.workers.dev";
  return {
    staging,
    name: staging ? "tablecast-staging" : "tablecast",
    endpoint: staging ? `${origin}/mcp` : connection.mcpServers.tablecast.url,
  };
}

export const readIntegrationConnection = createIsomorphicFn()
  .server(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    return integrationConnection(new URL(getRequest().url).origin);
  })
  .client(async () => integrationConnection(window.location.origin));
