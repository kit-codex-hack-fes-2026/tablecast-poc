import { createFileRoute } from "@tanstack/react-router";
import { helpLlms, helpSource } from "../lib/help-source";

export const Route = createFileRoute("/help/content/$")({
  server: {
    handlers: {
      GET: async ({ params: { _splat: splat } }) => {
        const [lang, ...segments] = (splat ?? "").split("/");
        if ((lang !== "ja" && lang !== "en") || !segments.at(-1)?.endsWith(".md"))
          return new Response("Not found", { status: 404 });
        const path = segments.join("/").slice(0, -3);
        const page = helpSource.getPage(path === "index" ? [] : path.split("/"), lang);
        if (!page) return new Response("Not found", { status: 404 });
        return new Response(await helpLlms.page(page), {
          headers: { "Content-Type": "text/markdown; charset=utf-8" },
        });
      },
    },
  },
});
