import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAPIError } from "better-auth/api";
import { apiFactory } from "../../platform/http";
import { registerConfigurationTools } from "./configuration-tools";
import { registerGamesTools } from "./games-tools";
import { registerRewardsTools } from "./rewards-tools";
import { resolveMcpActor } from "./service";

export const mcpRoutes = apiFactory.createApp().all("/", async (c) => {
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
  const server = new McpServer(
    { name: "tablecast-settings", version: "0.1.0" },
    {
      instructions: `TableCast Docs: ${c.env.TABLECAST_PUBLIC_ORIGIN}/help 。日英の索引とページ単位Markdown: ${c.env.TABLECAST_PUBLIC_ORIGIN}/llms.txt 。必要な章だけ読み、実際の入力schemaと取得した店舗・権限・版を使って操作する。Docsの閲覧は認証不要だが、業務操作にはOAuth認可が必要。下書きの保存・検証と、人による公開承認を区別する。`,
    },
  );
  registerRewardsTools(server, c.get("services"), actor);
  registerGamesTools(server, c.get("services"), actor);
  registerConfigurationTools(server, c.get("services"), actor);

  c.set("errorPhase", "mcp.transport");
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c);
});
