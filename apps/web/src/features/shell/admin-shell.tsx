import { PanelLeft, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";
import { LanguageSwitch } from "../../components/language-switch";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../components/ui/resizable";
import { useI18n } from "../../i18n/locale";
import { useMediaQuery } from "../../lib/use-media-query";
import { usePanelLayout } from "../../lib/use-panel-layout";

import { AdminSidebar, type AdminSidebarProps } from "./admin-sidebar";

export function AdminShell({
  children,
  header,
  ...sidebar
}: AdminSidebarProps & { children: ReactNode; header?: ReactNode }) {
  const { t, setLocale } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 48rem)");
  const panel = usePanelRef();
  const { defaultLayout, onLayoutChanged } = usePanelLayout({
    id: "tablecast-admin-layout",
    panelIds: desktop
      ? ["tablecast-admin-sidebar", "tablecast-admin-content"]
      : ["tablecast-admin-content"],
  });
  return (
    <>
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-dvh! bg-secondary/50 md:p-2 max-md:[&>#tablecast-admin-sidebar]:hidden"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        {desktop && (
          <ResizablePanel
            id="tablecast-admin-sidebar"
            key="tablecast-admin-sidebar"
            panelRef={panel}
            defaultSize="16rem"
            minSize="14rem"
            maxSize="24rem"
            collapsedSize="4.5rem"
            collapsible
            onResize={() => setCollapsed(panel.current?.isCollapsed() ?? false)}
          >
            <aside className="flex h-full min-w-0 flex-col px-2">
              <AdminSidebar {...sidebar} collapsed={collapsed} />
            </aside>
          </ResizablePanel>
        )}
        {desktop && (
          <ResizableHandle className="max-md:hidden" aria-label={t("admin_resize_sidebar")} />
        )}
        <ResizablePanel
          className="max-md:flex-1! max-md:min-w-0!"
          id="tablecast-admin-content"
          key="tablecast-admin-content"
          minSize={desktop ? "20rem" : 0}
        >
          <main className="h-full min-w-0 overflow-y-auto bg-white md:rounded-2xl md:border md:border-border">
            <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur-sm md:rounded-t-2xl">
              <Button
                size="icon"
                variant="ghost"
                className="hidden md:inline-flex"
                aria-label={t("admin_navigation")}
                aria-expanded={!collapsed}
                onClick={() => {
                  if (panel.current?.isCollapsed()) panel.current.expand();
                  else panel.current?.collapse();
                }}
              >
                <PanelLeft />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="md:hidden"
                aria-label={t("admin_navigation")}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
              >
                <PanelLeft />
              </Button>
              <div className="min-w-0 flex-1 truncate border-l border-border pl-3 text-base font-medium">
                {header ??
                  t(
                    sidebar.tab === "organisations"
                      ? "stores_title"
                      : sidebar.tab === "mcp"
                        ? "mcp_sessions"
                        : "account_title",
                  )}
              </div>
              <LanguageSwitch onChange={setLocale} />
            </header>
            <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent side="left" className="max-w-72 p-3">
          <DialogTitle className="sr-only">{t("admin_navigation")}</DialogTitle>
          <Button
            className="absolute right-2 top-3"
            size="icon"
            variant="ghost"
            aria-label={t("common_close")}
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </Button>
          <AdminSidebar {...sidebar} onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
