import { createFileRoute } from "@tanstack/react-router";
import { helpLlms, helpSource, helpTextHeaders } from "../lib/help-source";

export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          (
            await Promise.all(
              helpSource.getLanguages().map(({ language }) => helpLlms.full(language)),
            )
          ).join("\n\n"),
          { headers: helpTextHeaders },
        ),
    },
  },
});
