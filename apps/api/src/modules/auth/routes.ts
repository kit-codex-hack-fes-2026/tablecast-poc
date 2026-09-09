import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { previewOAuthFetch } from "./preview";
export const authRoutes = new Hono<ApiEnv>()
  .on(["GET", "POST"], ["/_tablecast/oauth/*", "/o/oauth2/v2/auth/*", "/_emulate/*"], (c) => {
    if (c.env.TABLECAST_ENV !== "preview") return c.notFound();
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
  .on(["GET", "POST"], "/api/auth/*", (c) => {
    ensure(
      !c.req.path.startsWith("/api/auth/tablecast/") && !c.req.path.startsWith("/api/auth/device"),
      "ROUTE_NOT_PUBLIC",
      404,
    );
    return c.get("services").auth.handler(c.req.raw);
  })
  .get("/.well-known/oauth-authorization-server/api/auth", (c) =>
    oauthProviderAuthServerMetadata(c.get("services").auth)(c.req.raw),
  )
  .get("/.well-known/openid-configuration/api/auth", (c) =>
    oauthProviderOpenIdConfigMetadata(c.get("services").auth)(c.req.raw),
  )
  .get("/.well-known/oauth-protected-resource/mcp", (c) =>
    c.json({
      resource: `${c.env.TABLECAST_PUBLIC_ORIGIN}/mcp`,
      authorization_servers: [`${c.env.TABLECAST_PUBLIC_ORIGIN}/api/auth`],
      scopes_supported: ["tablecast:read", "tablecast:write"],
      bearer_methods_supported: ["header"],
    }),
  );
