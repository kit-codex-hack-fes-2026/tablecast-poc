import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { registerDefaultLocale } from "./i18n/runtime-default";
import { paraglideMiddleware } from "./paraglide/server.js";

registerDefaultLocale();

export default createServerEntry({
  async fetch(request) {
    const response = await paraglideMiddleware(request, () => handler.fetch(request));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
});
