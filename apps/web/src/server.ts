import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";
import { paraglideMiddleware } from "./paraglide/server.js";

export default createServerEntry({
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (
      path.startsWith("/api/") ||
      path === "/mcp" ||
      path.startsWith("/mcp/") ||
      path.startsWith("/.well-known/") ||
      path.startsWith("/media/") ||
      path.startsWith("/internal/voice/") ||
      path.startsWith("/internal/deploy/") ||
      path.startsWith("/_tablecast/oauth/") ||
      path.startsWith("/o/oauth2/v2/auth/") ||
      path.startsWith("/_emulate/")
    ) {
      return env.TABLECAST_API.fetch(new Request(request, { redirect: "manual" }));
    }
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
});
