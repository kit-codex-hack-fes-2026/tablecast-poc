import { createFileRoute, notFound } from "@tanstack/react-router";
import { HelpPage } from "../features/help/help-page";
import stylesheet from "../help.css?url";
import { helpSource } from "../lib/help-source";

export const Route = createFileRoute("/help/$lang/$")({
  staticData: {
    document: { title: "help_title", description: "head_help_description" },
  },
  loader: ({ params: { lang, _splat: splat } }) => {
    if (lang !== "ja" && lang !== "en") throw notFound();
    const page = helpSource.getPage(splat?.split("/").filter(Boolean) ?? [], lang);
    if (!page) throw notFound();
    return { document: { name: page.data.title } };
  },
  head: ({ params: { lang, _splat: splat } }) => ({
    links: [
      { rel: "stylesheet", href: stylesheet },
      {
        rel: "alternate",
        type: "text/plain",
        href: "/llms.txt",
        title: "TableCast documentation index",
      },
      {
        rel: "alternate",
        type: "text/markdown",
        href: `/help/content/${lang}/${splat || "index"}.md`,
      },
    ],
  }),
  component: HelpRoute,
});

function HelpRoute() {
  const { lang, _splat } = Route.useParams();
  const page = helpSource.getPage(_splat?.split("/").filter(Boolean) ?? [], lang);
  if (!page) throw notFound();
  return <HelpPage page={page} />;
}
