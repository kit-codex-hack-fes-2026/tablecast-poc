import { createFileRoute } from "@tanstack/react-router";
import { helpLlms, helpMarkdownUrl, helpSource, helpTextHeaders } from "../lib/help-source";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            "# TableCast help",
            "> Public product help. Store data and MCP operations require OAuth. Read only the pages needed for your task.",
            ...helpSource
              .getLanguages()
              .map(({ language }) =>
                [
                  helpLlms.index(language),
                  ...helpSource
                    .getPages(language)
                    .map((page) => `- [${page.data.title} · Markdown](${helpMarkdownUrl(page)})`),
                ].join("\n"),
              ),
            "Full text: /llms-full.txt",
          ].join("\n\n"),
          { headers: helpTextHeaders },
        ),
    },
  },
});
