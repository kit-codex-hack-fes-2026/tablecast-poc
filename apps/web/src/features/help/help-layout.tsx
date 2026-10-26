import type { ComponentProps } from "react";
import { TOC, TOCPopover } from "fumadocs-ui/layouts/docs/page/slots/toc";
import { useSidebar } from "fumadocs-ui/layouts/docs/slots/sidebar";
import { appFrame, pageContent, pageSurface } from "../../components/ui/page-layout";
import { HelpHeader } from "./help-header";

export function HelpLayoutContainer({ className, ...props }: ComponentProps<"div">) {
  const { collapsed } = useSidebar();
  return (
    <div
      {...props}
      id="nd-docs-layout"
      data-sidebar-collapsed={collapsed}
      className={appFrame({
        className: [
          "grid min-h-0 grid-cols-[var(--fd-sidebar-col)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden [grid-template-areas:'sidebar_main'] [--fd-docs-height:100dvh] [--fd-header-height:--spacing(18)] [--fd-docs-row-1:0px] [--fd-docs-row-2:--spacing(18)] [--fd-docs-row-3:--spacing(18)] [--fd-sidebar-width:0px] [--fd-sidebar-col:var(--fd-sidebar-width)] data-[sidebar-collapsed=true]:[--fd-sidebar-col:0px] md:[--fd-docs-height:calc(100dvh_-_--spacing(4))]",
          className,
        ],
      })}
    />
  );
}

export function HelpPageContainer({ className, ...props }: ComponentProps<"article">) {
  return (
    <main
      data-scroll-restoration-id="tablecast-help-main"
      className={pageSurface({ className: "relative [grid-area:main]" })}
    >
      <HelpHeader />
      <article {...props} id="nd-page" data-page-motion className={pageContent({ className })} />
    </main>
  );
}

/** Fumadocsの目次をページヘッダーの横ではなく本文に置く。 */
export function HelpTableOfContents() {
  return (
    <div className="min-w-0 xl:sticky xl:top-24 xl:col-start-2 xl:row-start-1">
      <TOCPopover container={{ className: "static h-auto [grid-area:auto]" }} />
      <TOC
        container={{
          className: "static h-auto max-h-[calc(100dvh-8rem)] w-full p-0 [grid-area:auto]",
        }}
      />
    </div>
  );
}
