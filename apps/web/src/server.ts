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
      path.startsWith("/internal/voice/")
    ) {
      return env.TABLECAST_API.fetch(new Request(request, { redirect: "manual" }));
    }
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
});
