import { createFileRoute } from "@tanstack/react-router";
import { helpSearch } from "../lib/help-search";

export const Route = createFileRoute("/help/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const query = (params.get("query") ?? "").trim();
        const locale = params.get("locale") ?? "ja";
        if (query.length > 200 || (locale !== "ja" && locale !== "en"))
          return Response.json({ error: "Invalid search query" }, { status: 400 });
        return Response.json(query ? await helpSearch[locale].search(query, { limit: 16 }) : []);
      },
    },
  },
});
