import { useHotkey } from "@tanstack/react-hotkeys";
import { type ReactNode, type SyntheticEvent, useRef, useState } from "react";
import { usePanelRef } from "react-resizable-panels";
import type { SidebarSelection } from "./sidebar-model";
import { AppHeader } from "../../components/app-header";
import { NavigationDrawer, NavigationToggle } from "../../components/app-navigation";
import { appFrame, pageContent, pageSurface } from "../../components/ui/page-layout";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../components/ui/resizable";
import { useI18n } from "../../i18n/locale";
import { useMediaQuery } from "../../lib/use-media-query";
import { usePanelLayout } from "../../lib/use-panel-layout";
import { AdminSidebar, type AdminSidebarProps } from "./admin-sidebar";
import { useSidebarPreferences } from "./sidebar-preferences";

export function AdminShell({
  children,
  header,
  storeName,
  selection,
  ...sidebar
}: AdminSidebarProps & {
  children: ReactNode;
  header?: ReactNode;
  selection: SidebarSelection;
  storeName?: string;
}) {
  const { t, setLocale } = useI18n();
  const { preferences, update } = useSidebarPreferences(selection.user?.id);
  const collapsed = preferences.collapsed ?? false;
  const desktop = useMediaQuery("(min-width: 48rem)");
  const panel = usePanelRef();
  const sidebarInteraction = useRef(false);
  const [sidebarTransition, setSidebarTransition] = useState(false);
  const resizeDirectly = (event: SyntheticEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("[data-separator]"))
      setSidebarTransition(false);
  };
  const toggleSidebar = () => {
    setSidebarTransition(true);
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
        className={appFrame({
          className:
            "h-dvh! max-md:[&>#tablecast-admin-sidebar]:hidden motion-safe:data-[sidebar-transition=true]:[&>[data-panel]]:transition-[flex-grow] motion-safe:data-[sidebar-transition=true]:[&>[data-panel]]:duration-(--motion-state) motion-safe:data-[sidebar-transition=true]:[&>[data-panel]]:ease-(--motion-ease-out) motion-reduce:[&>[data-panel]]:transition-none",
        })}
        data-sidebar-transition={sidebarTransition}
        onPointerDownCapture={resizeDirectly}
        onKeyDownCapture={resizeDirectly}
        onTransitionEnd={(event) => {
          if (
            event.propertyName === "flex-grow" &&
            event.target instanceof Element &&
            event.target.parentElement === event.currentTarget
          )
            setSidebarTransition(false);
        }}
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
            className={pageSurface()}
          >
            <AppHeader
              onLocaleChange={setLocale}
              navigation={
                <>
                  <NavigationToggle
                    className="hidden md:inline-flex"
                    expanded={!collapsed}
                    controls="tablecast-admin-sidebar"
                    shortcut
                    onClick={toggleSidebar}
                  />
                  <MobileNavigation
                    key={desktop ? "desktop" : "mobile"}
                    {...sidebar}
                    selection={selection}
                  />
                </>
              }
              context={
                storeName &&
                (!desktop || collapsed) && (
                  <span
                    className={`min-w-0 truncate text-sm font-medium ${header ? "max-w-40" : "flex-1"}`}
                  >
                    {storeName}
                  </span>
                )
              }
            >
              {header}
            </AppHeader>
            <div data-page-motion className={pageContent()}>
              {children}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}

function MobileNavigation(sidebar: AdminSidebarProps & { selection: SidebarSelection }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NavigationToggle
        className="md:hidden"
        expanded={open}
        controls="tablecast-admin-mobile-sidebar"
        onClick={() => setOpen(true)}
      />
      <NavigationDrawer id="tablecast-admin-mobile-sidebar" open={open} onOpenChange={setOpen}>
        <AdminSidebar {...sidebar} onNavigate={() => setOpen(false)} />
      </NavigationDrawer>
    </>
  );
}
