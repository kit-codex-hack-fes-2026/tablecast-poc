import type { Item } from "fumadocs-core/page-tree";
import type { ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { useSidebar } from "fumadocs-ui/layouts/docs/slots/sidebar";
import { ArrowUpRight, PanelsTopLeft } from "lucide-react";
import { useI18n } from "../../i18n/locale";
import { NavigationGroup, navigationItemClass } from "../shell/navigation-group";
import { NavigationLink } from "../shell/navigation-link";
import { helpNavigationItem, navigationGroups } from "../shell/navigation-model";
import { SidebarFooter } from "../shell/sidebar-footer";
import { SidebarSearch } from "../shell/sidebar-search";

export function HelpSidebarGroup({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <Tooltip.Provider delay={250}>
      <NavigationGroup
        id="help"
        label={t("help_title")}
        icon={navigationGroups.help.Icon}
        collapsed={false}
      >
        {children}
      </NavigationGroup>
    </Tooltip.Provider>
  );
}

export function HelpSidebarItem({ item }: { item: Item }) {
  const { setOpen } = useSidebar();
  const { Icon } = helpNavigationItem(item.url);
  return (
    <NavigationLink
      className={navigationItemClass}
      to={item.url}
      activeOptions={{ exact: true }}
      title={typeof item.name === "string" ? item.name : undefined}
      onClick={() => setOpen(false)}
    >
      <Icon className="size-5" />
      <span className="min-w-0 flex-1 wrap-break-word">{item.name}</span>
    </NavigationLink>
  );
}

export function HelpSidebarSearch() {
  const { setOpen } = useSidebar();
  return <SidebarSearch onNavigate={() => setOpen(false)} />;
}

export function HelpSidebarFooter() {
  const { t } = useI18n();
  const { setOpen } = useSidebar();
  return (
    <Tooltip.Provider delay={250}>
      <SidebarFooter>
        <NavigationLink to="/admin/live" preload={false} onClick={() => setOpen(false)}>
          <PanelsTopLeft className="size-5 shrink-0" />
          <span className="min-w-0">{t("help_open_app")}</span>
          <ArrowUpRight className="ml-auto size-4" aria-hidden="true" />
        </NavigationLink>
      </SidebarFooter>
    </Tooltip.Provider>
  );
}
