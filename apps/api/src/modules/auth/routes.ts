import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { ensure } from "../../platform/errors";
import { apiFactory } from "../../platform/http";
import { isHostedEmulator, previewOAuthFetch } from "./preview";
export const authRoutes = apiFactory
  .createApp()
  .on(["GET", "POST"], ["/_tablecast/oauth/*", "/o/oauth2/v2/auth/*", "/_emulate/*"], (c) => {
    if (!isHostedEmulator(c.env)) return c.notFound();
    const url = new URL(c.req.url);
    const path =
      (url.pathname.startsWith("/_tablecast/oauth/")
        ? url.pathname.slice("/_tablecast/oauth".length)
        : url.pathname) + url.search;
    return previewOAuthFetch(c.env, path, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body,
      redirect: "manual",
    });
  })
  .on(["GET", "POST"], "/api/auth/*", async (c) => {
    ensure(
      !c.req.path.startsWith("/api/auth/tablecast/") && !c.req.path.startsWith("/api/auth/device"),
      "ROUTE_NOT_PUBLIC",
      404,
    );
    return (await c.get("services").getAuth()).handler(c.req.raw);
  })
  .get("/.well-known/oauth-authorization-server/api/auth", async (c) =>
    oauthProviderAuthServerMetadata(await c.get("services").getAuth())(c.req.raw),
  )
  .get("/.well-known/openid-configuration/api/auth", async (c) =>
    oauthProviderOpenIdConfigMetadata(await c.get("services").getAuth())(c.req.raw),
  )
  .get("/.well-known/oauth-protected-resource/mcp", (c) =>
    c.json({
      resource: `${c.env.TABLECAST_PUBLIC_ORIGIN}/mcp`,
      authorization_servers: [`${c.env.TABLECAST_PUBLIC_ORIGIN}/api/auth`],
      scopes_supported: ["tablecast:read", "tablecast:write"],
      bearer_methods_supported: ["header"],
    }),
  );
