import type { Item } from "fumadocs-core/page-tree";
import type { SidebarProps } from "fumadocs-ui/layouts/docs/slots/sidebar";
import type { ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Link } from "@tanstack/react-router";
import {
  SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  SidebarItem,
  SidebarSeparator,
} from "fumadocs-ui/components/sidebar/base";
import { createPageTreeRenderer } from "fumadocs-ui/components/sidebar/page-tree";
import { useSidebar } from "fumadocs-ui/layouts/docs/slots/sidebar";
import { ArrowUpRight, PanelsTopLeft } from "lucide-react";
import { useEffect } from "react";
import { NavigationDrawer } from "../../components/app-navigation";
import { Brand } from "../../components/brand";
import { useI18n } from "../../i18n/locale";
import { NavigationGroup, navigationItemClass } from "../shell/navigation-group";
import { NavigationLink } from "../shell/navigation-link";
import { helpNavigationItem, navigationGroups } from "../shell/navigation-model";
import { SidebarFooter } from "../shell/sidebar-footer";
import { SidebarSearch } from "../shell/sidebar-search";

const PageTree = createPageTreeRenderer({
  SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  SidebarItem,
  SidebarSeparator,
});

/** Fumadocsのページツリーを保ち、シェルの操作と表示枠は管理画面へ揃える。 */
export function HelpSidebar({ banner, footer, components }: SidebarProps) {
  const { open, setOpen, collapsed, mode } = useSidebar();
  useEffect(() => {
    if (mode === "full") setOpen(false);
  }, [mode, setOpen]);
  const content = <HelpSidebarContent banner={banner} footer={footer} components={components} />;
  if (mode === "drawer")
    return (
      <NavigationDrawer id="nd-sidebar-mobile" open={open} onOpenChange={setOpen}>
        {content}
      </NavigationDrawer>
    );
  return (
    <aside
      id="nd-sidebar"
      data-collapsed={collapsed}
      className="hidden min-h-0 flex-col px-2 [grid-area:sidebar] md:flex"
    >
      {content}
    </aside>
  );
}

function HelpSidebarContent({ banner, footer, components }: SidebarProps) {
  const { locale, t } = useI18n();
  const { mode, collapsed, setOpen } = useSidebar();
  const compact = mode === "full" && collapsed;
  return (
    <>
      <Link
        to="/help/$lang/$"
        params={{ lang: locale, _splat: "" }}
        aria-label={t("help_title")}
        className={`flex h-14 shrink-0 items-center gap-2 font-semibold ${compact ? "justify-center" : "px-2"}`}
        onClick={() => setOpen(false)}
      >
        <Brand variant={compact ? "symbol" : "logo"} />
      </Link>
      {banner}
      <nav
        className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-border py-3"
        aria-label={t("admin_navigation")}
      >
        <PageTree {...components} />
      </nav>
      {footer}
    </>
  );
}

export function HelpSidebarGroup({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { mode, collapsed } = useSidebar();
  return (
    <Tooltip.Provider delay={250}>
      <NavigationGroup
        id="help"
        label={t("help_title")}
        icon={navigationGroups.help.Icon}
        collapsed={mode === "full" && collapsed}
      >
        {children}
      </NavigationGroup>
    </Tooltip.Provider>
  );
}

export function HelpSidebarItem({ item }: { item: Item }) {
  const { setOpen, mode, collapsed } = useSidebar();
  const compact = mode === "full" && collapsed;
  const { Icon } = helpNavigationItem(item.url);
  return (
    <NavigationLink
      className={navigationItemClass}
      collapsed={compact}
      to={item.url}
      activeOptions={{ exact: true }}
      title={typeof item.name === "string" ? item.name : undefined}
      onClick={() => setOpen(false)}
    >
      <Icon className="size-5" />
      {!compact && <span className="min-w-0 flex-1 wrap-break-word">{item.name}</span>}
    </NavigationLink>
  );
}

export function HelpSidebarSearch() {
  const { setOpen, mode, collapsed } = useSidebar();
  return (
    <SidebarSearch collapsed={mode === "full" && collapsed} onNavigate={() => setOpen(false)} />
  );
}

export function HelpSidebarFooter() {
  const { t } = useI18n();
  const { setOpen, mode, collapsed } = useSidebar();
  const compact = mode === "full" && collapsed;
  return (
    <Tooltip.Provider delay={250}>
      <SidebarFooter>
        <NavigationLink
          to="/admin/live"
          preload={false}
          collapsed={compact}
          title={t("help_open_app")}
          onClick={() => setOpen(false)}
        >
          <PanelsTopLeft className="size-5 shrink-0" />
          {!compact && <span className="min-w-0">{t("help_open_app")}</span>}
          {!compact && <ArrowUpRight className="ml-auto size-4" aria-hidden="true" />}
        </NavigationLink>
      </SidebarFooter>
    </Tooltip.Provider>
  );
}
