import type { ReactNode } from "react";
import type { AdminSidebarProps } from "./admin-sidebar";
import { useI18n } from "../../i18n/locale";
import { NavigationGroup, navigationItemClass } from "./navigation-group";
import { NavigationLink as Link } from "./navigation-link";
import {
  isNavigationGroupId,
  isNavigationPageId,
  navigationGroups,
  navigationPages,
  navigationTarget,
} from "./navigation-model";

export function SidebarNavigation({
  tab,
  manager,
  selectedStore,
  selectedOrganization,
  collapsed,
  onNavigate,
  userId,
  menuNavigation,
}: Pick<AdminSidebarProps, "tab"> & {
  collapsed: boolean;
  manager: boolean;
  menuNavigation?: ReactNode;
  onNavigate?: () => void;
  selectedOrganization?: string;
  selectedStore?: string;
  userId?: string;
}) {
  const { t } = useI18n();
  return (
    <nav
      className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-border py-3"
      aria-label={t("admin_navigation")}
    >
      {Object.entries(navigationGroups).map(([key, group]) => {
        if (!isNavigationGroupId(key) || key === "help") return null;
        const id = key;
        if (!selectedStore && id !== "workspace") return null;
        return (
          <NavigationGroup
            key={id}
            id={id}
            label={t(group.label)}
            icon={group.Icon}
            collapsed={collapsed}
            userId={userId}
          >
            {id === "menu" && menuNavigation}
            {Object.entries(navigationPages).map(([pageKey, page]) => {
              if (page.group !== id || (id === "menu" && pageKey !== "games")) return null;
              if (!manager && "manager" in page && page.manager) return null;
              if (!isNavigationPageId(pageKey)) return null;
              const pageId = pageKey;
              const to = navigationTarget(pageId, { selectedStore, selectedOrganization });
              if (!to) return null;
              const Icon = page.Icon;
              return (
                <Link
                  key={pageId}
                  collapsed={collapsed}
                  className={navigationItemClass}
                  to={to}
                  activeOptions={{ exact: pageId === "home" }}
                  title={t(page.label)}
                  aria-label={pageId === "organisations" ? t("stores_title") : undefined}
                  aria-current={pageId === "billing" && tab === "billing" ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <Icon className="size-5" />
                  {!collapsed && t(page.label)}
                </Link>
              );
            })}
          </NavigationGroup>
        );
      })}
    </nav>
  );
}
