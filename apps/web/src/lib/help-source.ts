import { defineI18n } from "fumadocs-core/i18n";
import { type InferPageType, llms, loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";

const docs = defineDocs({
  dir: "../../.agents/skills/tablecast-help/references",
  docs: { postprocess: { includeProcessedMarkdown: true } },
});

export const helpI18n = defineI18n({
  languages: ["ja", "en"],
  defaultLanguage: "ja",
  parser: "dir",
  fallbackLanguage: null,
});

export const helpSource = loader({
  baseUrl: "/help",
  url: (slugs, locale) => `/help/${locale}${slugs.length ? `/${slugs.join("/")}` : ""}`,
  i18n: helpI18n,
  source: docs.toFumadocsSource(),
});

export function helpMarkdownUrl(page: InferPageType<typeof helpSource>) {
  return `/help/content/${page.locale}/${page.slugs.join("/") || "index"}.md`;
}

export function resolveHelpLink(
  page: InferPageType<typeof helpSource>,
  href: string,
  markdown = false,
) {
  // dir parserの公開pathには言語を含むが、参照の解決には言語内の仮想ディレクトリを渡す。
  const segments = page.path.split("/");
  if (segments[0] === page.locale) segments.shift();
  segments.pop();
  const target = helpSource.getPageByHref(href, { dir: segments.join("/"), language: page.locale });
  if (!target) return href;
  return `${markdown ? helpMarkdownUrl(target.page) : target.page.url}${target.hash ? `#${target.hash}` : ""}`;
}

export const helpLlms = llms(helpSource, {
  renderPage: async (page) => {
    const content = await page.data.getText("processed");
    // 同梱版の相対リンクを、全章をまとめた場合も辿れる公開MarkdownのURLへ変える。
    const linked = content.replace(
      /\]\((\.\.?\/[^)]+\.md(?:#[^)]*)?)\)/g,
      (match, href: string) => {
        const resolved = resolveHelpLink(page, href, true);
        return resolved === href ? match : `](${resolved})`;
      },
    );
    return `# ${page.data.title}\n\n${page.data.description ?? ""}\n\nWeb: ${page.url}\nMarkdown: ${helpMarkdownUrl(page)}\n\n${linked}`;
  },
});

export const helpTextHeaders = { "Content-Type": "text/plain; charset=utf-8" };
