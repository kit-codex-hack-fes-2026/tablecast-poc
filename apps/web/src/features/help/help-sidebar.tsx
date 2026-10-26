import type { Item } from "fumadocs-core/page-tree";
import type { ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { useSidebar } from "fumadocs-ui/layouts/docs/slots/sidebar";
import { LayoutGroup } from "motion/react";
import { useId } from "react";
import { useI18n } from "../../i18n/locale";
import { NavigationGroup, navigationItemClass } from "../shell/navigation-group";
import { NavigationLink } from "../shell/navigation-link";
import { helpNavigationItem, navigationGroups } from "../shell/navigation-model";
import { SidebarSearch } from "../shell/sidebar-search";

export function HelpSidebarGroup({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const layoutId = useId();
  return (
    <Tooltip.Provider delay={250}>
      <LayoutGroup id={layoutId}>
        <NavigationGroup
          id="help"
          label={t("help_title")}
          icon={navigationGroups.help.Icon}
          collapsed={false}
        >
          {children}
        </NavigationGroup>
      </LayoutGroup>
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
      {item.name}
    </NavigationLink>
  );
}

export function HelpSidebarSearch() {
  const { setOpen } = useSidebar();
  return <SidebarSearch onNavigate={() => setOpen(false)} />;
}
