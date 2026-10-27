import type { InferPageType } from "fumadocs-core/source";
import type { AnchorHTMLAttributes } from "react";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsPage, PageBreadcrumb, PageFooter } from "fumadocs-ui/layouts/docs/page";
import { TOCProvider } from "fumadocs-ui/layouts/docs/page/slots/toc";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { createContext, useContext } from "react";
import { Brand } from "../../components/brand";
import { PageHeader } from "../../components/page-header";
import { useI18n } from "../../i18n/locale";
import { helpI18n, helpSource, resolveHelpLink } from "../../lib/help-source";
import { helpNavigationItem } from "../shell/navigation-model";
import { HelpLayoutContainer, HelpPageContainer, HelpTableOfContents } from "./help-layout";
import {
  HelpSidebarFooter,
  HelpSidebarGroup,
  HelpSidebarItem,
  HelpSidebarSearch,
} from "./help-sidebar";

const HelpPageContext = createContext<InferPageType<typeof helpSource> | undefined>(undefined);

function HelpLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const page = useContext(HelpPageContext);
  return (
    <defaultMdxComponents.a {...props} href={page && href ? resolveHelpLink(page, href) : href} />
  );
}

const components = { ...defaultMdxComponents, a: HelpLink };
function Hidden() {
  return null;
}
const helpLayoutSlots = { container: HelpLayoutContainer, header: Hidden };
const helpPageSlots = {
  container: HelpPageContainer,
  toc: { provider: TOCProvider, main: Hidden, popover: Hidden },
};
const sidebarComponents = { Folder: HelpSidebarGroup, Item: HelpSidebarItem };

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
  const { t } = useI18n();
  const Body = page.data.body;
  const tree = helpSource.getPageTree(page.locale);
  const { Icon } = helpNavigationItem(page.url);
  return (
    <div lang={page.locale} className="text-foreground">
      <RootProvider
        theme={{ enabled: false }}
        search={{ enabled: false }}
        i18n={translations.provider(page.locale)}
      >
        <DocsLayout
          slots={helpLayoutSlots}
          tree={{
            ...tree,
            children: [{ type: "folder", name: t("help_title"), children: tree.children }],
          }}
          sidebar={{
            className: "border-e-0 bg-transparent",
            components: sidebarComponents,
            banner: <HelpSidebarSearch />,
            footer: <HelpSidebarFooter />,
          }}
          nav={{
            title: (
              <>
                <Brand variant="symbol" />
                <span>TableCast {t("help_title")}</span>
              </>
            ),
            url: `/help/${page.locale}`,
          }}
          searchToggle={{ enabled: false }}
          themeSwitch={{ enabled: false }}
          i18n={false}
        >
          <DocsPage
            toc={page.data.toc}
            slots={helpPageSlots}
            breadcrumb={{ enabled: false }}
            footer={{ enabled: false }}
          >
            <PageHeader
              title={page.data.title}
              description={page.data.description}
              icon={<Icon />}
            />
            <div
              data-ui="page-body"
              className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]"
            >
              <HelpTableOfContents />
              <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
                <PageBreadcrumb />
                <DocsBody>
                  <HelpPageContext value={page}>
                    <Body components={components} />
                  </HelpPageContext>
                </DocsBody>
                <PageFooter />
              </div>
            </div>
          </DocsPage>
        </DocsLayout>
      </RootProvider>
    </div>
  );
}
