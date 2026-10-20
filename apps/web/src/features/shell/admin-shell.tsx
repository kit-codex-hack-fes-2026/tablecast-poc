import { useSidebarPreferences } from "./sidebar-preferences";
import { useHotkey } from "@tanstack/react-hotkeys";
import { PanelLeft, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
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

import { AdminSidebar, useSidebarStore, type AdminSidebarProps } from "./admin-sidebar";

export function AdminShell({
  children,
  header,
  storeName,
  ...sidebar
}: AdminSidebarProps & { children: ReactNode; header?: ReactNode; storeName?: string }) {
  const { t, setLocale } = useI18n();
  const selection = useSidebarStore(sidebar);
  const { session } = selection;
  const { preferences, update } = useSidebarPreferences(session.data?.user.id);
  const collapsed = preferences.collapsed ?? false;
  const desktop = useMediaQuery("(min-width: 48rem)");
  const panel = usePanelRef();
  const sidebarInteraction = useRef(false);
  const toggleSidebar = () => {
    sidebarInteraction.current = true;
    if (panel.current?.isCollapsed()) panel.current.expand();
    else panel.current?.collapse();
  };
  useHotkey("Mod+B", toggleSidebar, { enabled: desktop, ignoreInputs: true });
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
        onLayoutChanged={(layout, meta) => {
          onLayoutChanged(layout, {
            ...meta,
            isUserInteraction: meta.isUserInteraction || sidebarInteraction.current,
          });
          sidebarInteraction.current = false;
        }}
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
            onResize={() => update({ collapsed: panel.current?.isCollapsed() ?? false })}
          >
            <aside className="flex h-full min-w-0 flex-col px-2">
              <AdminSidebar {...sidebar} selection={selection} collapsed={collapsed} />
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
          <main
            id="tablecast-admin-main"
            data-scroll-restoration-id="tablecast-admin-main"
            className="h-full min-w-0 overflow-y-auto bg-card md:rounded-2xl md:shadow-surface"
          >
            <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-glass px-4 py-2 backdrop-blur-xl @container md:rounded-t-2xl">
              <Button
                size="icon"
                variant="ghost"
                className="hidden md:inline-flex"
                aria-label={t("admin_navigation")}
                aria-expanded={!collapsed}
                title={`${t("admin_navigation")} (⌘/Ctrl+B)`}
                aria-keyshortcuts="Control+B Meta+B"
                onClick={toggleSidebar}
              >
                <PanelLeft />
              </Button>
              <MobileNavigation
                key={desktop ? "desktop" : "mobile"}
                {...sidebar}
                selection={selection}
              />
              {storeName && (!desktop || collapsed) && (
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{storeName}</span>
              )}
              {header && (
                <div className="order-last min-w-0 basis-full text-base font-medium @3xl:order-0 @3xl:flex-1 @3xl:basis-72">
                  {header}
                </div>
              )}
              <div className="ml-auto">
                <LanguageSwitch onChange={setLocale} />
              </div>
            </header>
            <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 @container p-4 sm:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}

function MobileNavigation(
  sidebar: AdminSidebarProps & { selection: ReturnType<typeof useSidebarStore> },
) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="md:hidden"
        aria-label={t("admin_navigation")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <PanelLeft />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="left" className="max-w-72 p-3">
          <DialogTitle className="sr-only">{t("admin_navigation")}</DialogTitle>
          <Button
            className="absolute right-2 top-3"
            size="icon"
            variant="ghost"
            aria-label={t("common_close")}
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
          <AdminSidebar {...sidebar} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
