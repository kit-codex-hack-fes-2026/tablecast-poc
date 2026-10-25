import type { InferPageType } from "fumadocs-core/source";
import type { AnchorHTMLAttributes } from "react";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { createContext, useContext } from "react";
import { Brand } from "../../components/brand";
import { helpI18n, helpMarkdownUrl, helpSource, resolveHelpLink } from "../../lib/help-source";

const HelpPageContext = createContext<InferPageType<typeof helpSource> | undefined>(undefined);

function HelpLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const page = useContext(HelpPageContext);
  return (
    <defaultMdxComponents.a {...props} href={page && href ? resolveHelpLink(page, href) : href} />
  );
}

const components = { ...defaultMdxComponents, a: HelpLink };

const translations = defineI18nUI(helpI18n, {
  ja: {
    displayName: "日本語",
    "On this page(table of contents)": "このページの内容",
    "Next Page(pagination)": "次のページ",
    "Previous Page(pagination)": "前のページ",
    "Open Sidebar(sidebar)(aria-label)": "目次を開く",
    "Close Sidebar(sidebar)(aria-label)": "目次を閉じる",
    "Hide Sidebar(sidebar)": "目次を隠す",
    "Collapse Sidebar(sidebar)(aria-label)": "目次を折りたたむ",
    "Open Sidebar(aria-label)": "目次を開く",
    "Close Sidebar(aria-label)": "目次を閉じる",
    "Copy Anchor Link(heading anchor)(aria-label)": "見出しへのリンクをコピー",
    "Copied Anchor Link(heading anchor)(aria-label)": "リンクをコピーしました",
    "No Headings(table of contents)": "見出しはありません",
  },
  en: { displayName: "English" },
});

export function HelpPage({ page }: { page: InferPageType<typeof helpSource> }) {
  const english = page.locale === "en";
  const Body = page.data.body;
  return (
    <div lang={page.locale} className="min-h-dvh bg-background text-foreground">
      <RootProvider
        theme={{ enabled: false }}
        search={{ enabled: false }}
        i18n={translations.provider(page.locale)}
      >
        <DocsLayout
          tree={helpSource.getPageTree(page.locale)}
          nav={{
            title: (
              <>
                <Brand variant="symbol" />
                <span>TableCast {english ? "Help" : "ヘルプ"}</span>
              </>
            ),
            url: `/help/${page.locale}`,
          }}
          searchToggle={{ enabled: false }}
          themeSwitch={{ enabled: false }}
          i18n={false}
          links={[
            {
              text: english ? "日本語" : "English",
              url: `/help/${english ? "ja" : "en"}/${page.slugs.join("/")}`,
            },
            { text: english ? "Open TableCast" : "TableCastを開く", url: "/admin/live" },
          ]}
        >
          <DocsPage toc={page.data.toc}>
            <DocsTitle>{page.data.title}</DocsTitle>
            <DocsDescription>{page.data.description}</DocsDescription>
            <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span>
                {english ? "Public help · No sign-in required" : "公開ヘルプ · ログイン不要"}
              </span>
              <a className="underline underline-offset-4" href={helpMarkdownUrl(page)}>
                Markdown
              </a>
              <a className="underline underline-offset-4" href="/llms.txt">
                {english ? "Agent index" : "Agent向け索引"}
              </a>
            </div>
            <DocsBody>
              <HelpPageContext value={page}>
                <Body components={components} />
              </HelpPageContext>
            </DocsBody>
          </DocsPage>
        </DocsLayout>
      </RootProvider>
    </div>
  );
}
