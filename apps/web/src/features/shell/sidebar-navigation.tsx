import { NavigationLink as Link } from "./navigation-link";
import {
  Building2,
  CreditCard,
  History,
  House,
  ChartNoAxesCombined,
  Gamepad2,
  Gift,
  TicketPercent,
  LayoutDashboard,
  MonitorSmartphone,
  Plug,
  Store,
  Users,
  UtensilsCrossed,
  Blocks,
  BookOpen,
  KeyRound,
} from "lucide-react";
import { useI18n } from "../../i18n/locale";
import type { AdminSidebarProps } from "./admin-sidebar";
import { MenuNavigation } from "./menu-navigation";
import { NavigationGroup, navigationItemClass } from "./navigation-group";
export function SidebarNavigation({
  tab,
  manager,
  selectedStore,
  selectedOrganization,
  collapsed,
  onNavigate,
  draftId,
  userId,
}: Pick<AdminSidebarProps, "tab"> & {
  selectedStore?: string;
  selectedOrganization?: string;
  manager: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  draftId?: string;
  userId?: string;
}) {
  const { t } = useI18n();
  const common = { collapsed, userId };
  return (
    <nav
      className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-border py-3"
      aria-label={t("admin_navigation")}
    >
      {selectedStore && (
        <>
          <NavigationGroup
            {...common}
            id="operations"
            label={t("nav_operations")}
            icon={LayoutDashboard}
          >
            <Link
              collapsed={collapsed}
              className={navigationItemClass}
              to="/admin/stores/$storeId"
              params={{ storeId: selectedStore }}
              activeOptions={{ exact: true }}
              onClick={onNavigate}
              title={t("home_title")}
              aria-label={t("home_title")}
            >
              <House className="size-4" />
              {!collapsed && t("home_title")}
            </Link>
            <Link
              collapsed={collapsed}
              className={navigationItemClass}
              to="/admin/stores/$storeId/floor"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("admin_live")}
            >
              <LayoutDashboard className="size-4" />
              {!collapsed && t("admin_live")}
            </Link>
            <Link
              collapsed={collapsed}
              className={navigationItemClass}
              to="/admin/stores/$storeId/visits"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("admin_history")}
            >
              <History className="size-4" />
              {!collapsed && t("admin_history")}
            </Link>
            {manager && (
              <Link
                collapsed={collapsed}
                className={navigationItemClass}
                to="/admin/stores/$storeId/statistics"
                params={{ storeId: selectedStore }}
                search={{ period: "today", view: "summary" }}
                onClick={onNavigate}
                title={t("statistics_title")}
                aria-label={t("statistics_title")}
              >
                <ChartNoAxesCombined className="size-4" />
                {!collapsed && t("statistics_title")}
              </Link>
            )}
          </NavigationGroup>
          <NavigationGroup {...common} id="menu" label={t("admin_config")} icon={UtensilsCrossed}>
            <MenuNavigation
              manager={manager}
              storeId={selectedStore}
              draftId={draftId}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
            <Link
              collapsed={collapsed}
              className={navigationItemClass}
              to="/admin/stores/$storeId/games"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("games_title")}
            >
              <Gamepad2 className="size-4" />
              {!collapsed && t("games_title")}
            </Link>
          </NavigationGroup>
          <NavigationGroup {...common} id="rewards" label={t("nav_rewards")} icon={Gift}>
            <Link
              collapsed={collapsed}
              className={navigationItemClass}
              to="/admin/stores/$storeId/points"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("customer_points_policy")}
            >
              <Gift className="size-4" />
              {!collapsed && t("customer_points_policy")}
            </Link>
            <Link
              collapsed={collapsed}
              className={navigationItemClass}
              to="/admin/stores/$storeId/coupons"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("coupons")}
            >
              <TicketPercent className="size-4" />
              {!collapsed && t("coupons")}
            </Link>
          </NavigationGroup>
          <NavigationGroup {...common} id="store" label={t("nav_store_management")} icon={Store}>
            {(
              [
                { to: "/admin/stores/$storeId/members", label: "org_members", Icon: Users },
                {
                  to: "/admin/stores/$storeId/devices",
                  label: "device_title",
                  Icon: MonitorSmartphone,
                },
                { to: "/admin/stores/$storeId/profile", label: "store_profile", Icon: Store },
              ] as const
            ).map(({ to, label, Icon }) => (
              <Link
                collapsed={collapsed}
                key={to}
                className={navigationItemClass}
                to={to}
                params={{ storeId: selectedStore }}
                title={t(label)}
                onClick={onNavigate}
              >
                <Icon className="size-4" />
                {!collapsed && t(label)}
              </Link>
            ))}
            {selectedOrganization && (
              <Link
                collapsed={collapsed}
                className={navigationItemClass}
                to="/billing/$organizationId"
                params={{ organizationId: selectedOrganization }}
                title={t("billing_title")}
                aria-label={t("billing_title")}
                aria-current={tab === "billing" ? "page" : undefined}
                onClick={onNavigate}
              >
                <CreditCard className="size-4" />
                {!collapsed && t("billing_title")}
              </Link>
            )}
          </NavigationGroup>
        </>
      )}
      <WorkspaceNavigation
        tab={tab}
        collapsed={collapsed}
        userId={userId}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function WorkspaceNavigation({
  tab,
  collapsed,
  userId,
  onNavigate,
}: Pick<AdminSidebarProps, "tab"> & {
  collapsed: boolean;
  userId?: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const common = { collapsed, userId };
  return (
    <NavigationGroup {...common} id="workspace" label={t("nav_workspace")} icon={Plug}>
      <Link
        collapsed={collapsed}
        className={navigationItemClass}
        to="/organisations"
        title={t("nav_all_stores")}
        aria-label={t("stores_title")}
        aria-current={tab === "organisations" ? "page" : undefined}
        onClick={onNavigate}
      >
        <Building2 className="size-4" />
        {!collapsed && t("nav_all_stores")}
      </Link>
      {(
        [
          { to: "/account/integrations/plugins", label: "mcp_plugin_install", Icon: Blocks },
          { to: "/account/integrations/manual", label: "mcp_manual_install", Icon: BookOpen },
          { to: "/account/mcp-sessions", label: "mcp_oauth_sessions", Icon: KeyRound },
        ] as const
      ).map(({ to, label, Icon }) => (
        <Link
          collapsed={collapsed}
          key={to}
          className={navigationItemClass}
          to={to}
          title={t(label)}
          onClick={onNavigate}
        >
          <Icon className="size-4" />
          {!collapsed && t(label)}
        </Link>
      ))}
    </NavigationGroup>
  );
}
