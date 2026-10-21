import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAPIError } from "better-auth/api";
import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { registerConfigurationTools } from "./configuration-tools";
import { registerGamesTools } from "./games-tools";
import { registerRewardsTools } from "./rewards-tools";
import { resolveMcpActor } from "./service";

export const mcpRoutes = new Hono<ApiEnv>().all("/", async (c) => {
  let principal;
  c.set("errorPhase", "mcp.authentication");
  try {
    principal = await c
      .get("services")
      .auth.api.tablecastMcpPrincipal({ headers: c.req.raw.headers });
  } catch (error) {
    if (!isAPIError(error) || ![401, 403].includes(error.statusCode)) throw error;
    c.error = error;
    return c.json({ error: "invalid_token" }, 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${c.env.TABLECAST_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    });
  }
  c.set("errorPhase", "mcp.store");
  const actor = await resolveMcpActor(c.get("services"), principal, c.req.query("storeId"));
  c.set("errorPhase", "mcp.registration");
  const server = new McpServer({ name: "tablecast-settings", version: "0.1.0" });
  registerRewardsTools(server, c.get("services"), actor);
  registerGamesTools(server, c.get("services"), actor);
  registerConfigurationTools(server, c.get("services"), actor);

  c.set("errorPhase", "mcp.transport");
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c);
});
