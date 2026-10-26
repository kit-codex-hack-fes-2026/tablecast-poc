import { Tooltip } from "@base-ui/react/tooltip";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, AudioLines, Tablet } from "lucide-react";
import { type ReactNode } from "react";
import type { SidebarSelection } from "./sidebar-model";
import { Brand } from "../../components/brand";
import { useI18n } from "../../i18n/locale";
import { navigationItemClass as sidebarItemClass } from "./navigation-group";
import { NavigationLink } from "./navigation-link";
import { SidebarNavigation } from "./sidebar-navigation";
import { SidebarSearch } from "./sidebar-search";
import { SidebarUserMenu } from "./sidebar-user-menu";
import { StorePicker } from "./store-picker";

type Tab = "history" | "live" | "settings";

export type AdminSidebarProps = {
  draftId?: string;
  onSignOut?: () => void;
  organizationId?: string;
  renderMenuNavigation?: (options: { collapsed: boolean; onNavigate?: () => void }) => ReactNode;
  renderStorePicker?: (options: { collapsed: boolean; onNavigate?: () => void }) => ReactNode;
  signingOut?: boolean;
  storeId?: string;
  tab: "account" | "billing" | "mcp" | "organisations" | Tab;
};

export function AdminSidebar({
  tab,
  onSignOut,
  signingOut,
  renderStorePicker,
  collapsed = false,
  selection,
  renderMenuNavigation,
  onNavigate,
}: AdminSidebarProps & {
  collapsed?: boolean;
  onNavigate?: () => void;
  selection: SidebarSelection;
}) {
  const { t } = useI18n();
  const {
    user,
    pending,
    error,
    availableStores,
    selectedStore,
    selectedOrganization,
    onChange,
    manager,
  } = selection;

  return (
    <Tooltip.Provider delay={250}>
      <Link
        to="/admin/live"
        className={`flex h-14 shrink-0 items-center gap-2 font-semibold ${collapsed ? "justify-center" : "px-2"}`}
        onClick={onNavigate}
      >
        <Brand variant={collapsed ? "symbol" : "logo"} />
      </Link>
      <div className="shrink-0 pb-3">
        {renderStorePicker ? (
          renderStorePicker({ collapsed, onNavigate })
        ) : (
          <StorePicker
            stores={availableStores}
            selectedStore={selectedStore}
            pending={pending}
            error={error}
            collapsed={collapsed}
            onChange={(id) => onChange(id, onNavigate)}
          />
        )}
      </div>
      <SidebarSearch
        collapsed={collapsed}
        selectedStore={selectedStore}
        selectedOrganization={selectedOrganization}
        manager={manager}
        onNavigate={onNavigate}
      />
      <SidebarNavigation
        tab={tab}
        selectedStore={selectedStore}
        manager={manager}
        selectedOrganization={selectedOrganization}
        userId={user?.id}
        collapsed={collapsed}
        onNavigate={onNavigate}
        menuNavigation={renderMenuNavigation?.({ collapsed, onNavigate })}
      />
      <div className="flex flex-col gap-2 border-t border-border py-3">
        {selectedStore && manager && (
          <DemoLink
            storeId={selectedStore}
            collapsed={collapsed}
            className={sidebarItemClass}
            onNavigate={onNavigate}
          />
        )}
        <NavigationLink
          collapsed={collapsed}
          className={sidebarItemClass}
          to="/"
          title={t("auth_guest")}
          aria-label={t("auth_guest")}
          onClick={onNavigate}
        >
          <Tablet className="size-5 shrink-0" />
          {!collapsed && t("auth_guest")}
        </NavigationLink>
        <SidebarUserMenu
          user={user}
          collapsed={collapsed}
          signingOut={signingOut}
          onSignOut={onSignOut}
        />
      </div>
    </Tooltip.Provider>
  );
}

function DemoLink({
  storeId,
  collapsed,
  className,
  onNavigate,
}: {
  className: string;
  collapsed: boolean;
  onNavigate?: () => void;
  storeId: string;
}) {
  const { t } = useI18n();
  return (
    <NavigationLink
      collapsed={collapsed}
      className={className}
      to="/admin/stores/$storeId/demo"
      params={{ storeId }}
      search={{ demoId: undefined }}
      target="_blank"
      rel="noopener"
      title={t("demo_open")}
      aria-label={t("demo_open")}
      onClick={onNavigate}
    >
      <AudioLines className="size-5 shrink-0" />
      {!collapsed && <span className="min-w-0">{t("demo_title")}</span>}
      {!collapsed && <ArrowUpRight className="ml-auto size-4" aria-hidden="true" />}
    </NavigationLink>
  );
}
