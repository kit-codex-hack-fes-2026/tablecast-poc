import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server.js";

export default createServerEntry({
  async fetch(request) {
    const response = await paraglideMiddleware(request, () => handler.fetch(request));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
});
