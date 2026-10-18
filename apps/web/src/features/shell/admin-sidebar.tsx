import { Brand } from "../../components/brand";
import { Collapsible } from "@base-ui/react/collapsible";
import { Menu } from "@base-ui/react/menu";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useHydrated } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  CreditCard,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  History,
  House,
  ChartNoAxesCombined,
  Gamepad2,
  Gift,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Plug,
  Settings2,
  Tablet,
  Store,
  UserRound,
  Users,
} from "lucide-react";
import { StoreIcon } from "../../components/store-icon";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { sessionOptions } from "../../lib/session-query";
import { MenuNavigation } from "./menu-navigation";
import { useConfigurationRoute } from "./configuration-route";
import { storesOptions, type loadStores } from "../store/store-query";

import { authClient } from "../../lib/auth-client";

type Tab = "live" | "history" | "settings";
export type AdminSidebarProps = {
  tab: Tab | "account" | "organisations" | "mcp" | "billing";
  storeId?: string;
  organizationId?: string;
  onSignOut?: () => void;
  signingOut?: boolean;
  renderStorePicker?: (options: { collapsed: boolean; onNavigate?: () => void }) => ReactNode;
};
const sidebarItemClass =
  "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-base text-foreground hover:bg-secondary aria-[current=page]:bg-secondary aria-[current=page]:font-medium data-[status=active]:bg-secondary data-[status=active]:font-medium";
export function AdminSidebar({
  tab,
  storeId,
  organizationId,
  onSignOut,
  signingOut,
  renderStorePicker,
  collapsed = false,
  onNavigate,
}: AdminSidebarProps & { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const session = useQuery(sessionOptions);
  const { active: inMenu, draftId } = useConfigurationRoute();
  const stores = useQuery({ ...storesOptions, enabled: !!session.data });
  const availableStores = stores.data?.stores ?? [];
  const selectedStore =
    storeId ??
    (organizationId
      ? availableStores.find((store) => store.organizationId === organizationId)?.id
      : undefined);

  return (
    <>
      <Link
        to="/admin/live"
        className="flex h-14 shrink-0 items-center gap-2 px-2 font-semibold"
        onClick={onNavigate}
      >
        <Brand variant={collapsed ? "symbol" : "logo"} />
      </Link>
      {renderStorePicker && (
        <div className="shrink-0 pb-3">{renderStorePicker({ collapsed, onNavigate })}</div>
      )}
      <SidebarNavigation
        tab={tab}
        selectedStore={selectedStore}
        manager={["owner", "admin"].includes(
          availableStores.find((store) => store.id === selectedStore)?.role ?? "",
        )}
        selectedOrganization={
          organizationId ??
          availableStores.find((store) => store.id === selectedStore)?.organizationId
        }
        collapsed={collapsed}
        onNavigate={onNavigate}
        inMenu={inMenu}
        draftId={draftId}
      />
      <div className="space-y-2 border-t border-border py-3">
        {selectedStore &&
          ["owner", "admin"].includes(
            availableStores.find((store) => store.id === selectedStore)?.role ?? "",
          ) && (
            <DemoLink
              storeId={selectedStore}
              collapsed={collapsed}
              className={sidebarItemClass}
              onNavigate={onNavigate}
            />
          )}
        <Link
          className={sidebarItemClass}
          to="/"
          title={t("auth_guest")}
          aria-label={t("auth_guest")}
          onClick={onNavigate}
        >
          <ArrowUpRight className="size-5 shrink-0" />
          {!collapsed && t("auth_guest")}
        </Link>
        <SidebarUserMenu
          user={session.data?.user}
          collapsed={collapsed}
          signingOut={signingOut}
          onSignOut={onSignOut}
        />
      </div>
    </>
  );
}

function DemoLink({
  storeId,
  collapsed,
  className,
  onNavigate,
}: {
  storeId: string;
  collapsed: boolean;
  className: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Link
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
      <Tablet className="size-5 shrink-0" />
      {!collapsed && t("demo_title")}
      {!collapsed && <ArrowUpRight className="ml-auto size-4" />}
    </Link>
  );
}

function SidebarNavigation({
  tab,
  manager,
  selectedStore,
  selectedOrganization,
  collapsed,
  onNavigate,
  inMenu,
  draftId,
}: Pick<AdminSidebarProps, "tab"> & {
  selectedStore?: string;
  manager: boolean;
  selectedOrganization?: string;
  collapsed: boolean;
  onNavigate?: () => void;
  inMenu: boolean;
  draftId?: string;
}) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  return (
    <nav
      className="flex-1 space-y-1 overflow-y-auto border-t border-border py-3"
      aria-label={t("admin_navigation")}
    >
      {selectedStore && (
        <>
          {!collapsed && (
            <h2 className="px-2 pb-2 text-xs font-semibold text-muted-foreground">
              {t("nav_operations")}
            </h2>
          )}
          <OverviewNavigation
            storeId={selectedStore}
            manager={manager}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <Link
            className={sidebarItemClass}
            to="/admin/stores/$storeId/floor"
            params={{ storeId: selectedStore }}
            onClick={onNavigate}
            title={t("admin_live")}
          >
            <LayoutDashboard className="size-5 shrink-0" />
            {!collapsed && t("admin_live")}
          </Link>
          <Link
            className={sidebarItemClass}
            to="/admin/stores/$storeId/visits"
            params={{ storeId: selectedStore }}
            onClick={onNavigate}
            title={t("admin_history")}
          >
            <History className="size-5 shrink-0" />
            {!collapsed && t("admin_history")}
          </Link>
          <div className="pt-4">
            {collapsed ? (
              <Link
                className={sidebarItemClass}
                to="/admin/stores/$storeId/menu/$section"
                params={{ storeId: selectedStore, section: "products" }}
                title={t("admin_config")}
                onClick={onNavigate}
              >
                <Settings2 className="size-5 shrink-0" />
              </Link>
            ) : (
              <Collapsible.Root key={String(inMenu)} defaultOpen={inMenu}>
                <Collapsible.Trigger disabled={!hydrated} className={`${sidebarItemClass} group`}>
                  <Settings2 className="size-5 shrink-0" />
                  {t("admin_config")}
                  <ChevronRight className="ml-auto size-4 shrink-0 group-aria-expanded:rotate-90" />
                </Collapsible.Trigger>
                <Collapsible.Panel>
                  <MenuNavigation
                    manager={manager}
                    storeId={selectedStore}
                    draftId={draftId}
                    onNavigate={onNavigate}
                  />
                  <Link
                    className={`${sidebarItemClass} ml-4 w-auto`}
                    to="/admin/stores/$storeId/games"
                    params={{ storeId: selectedStore }}
                    onClick={onNavigate}
                  >
                    <Gamepad2 className="size-4 shrink-0" />
                    {t("games_title")}
                  </Link>
                </Collapsible.Panel>
              </Collapsible.Root>
            )}
          </div>
          {collapsed && (
            <Link
              className={sidebarItemClass}
              to="/admin/stores/$storeId/games"
              params={{ storeId: selectedStore }}
              title={t("games_title")}
              onClick={onNavigate}
            >
              <Gamepad2 className="size-5 shrink-0" />
            </Link>
          )}
          {(
            [
              {
                label: "nav_rewards",
                items: [
                  {
                    to: "/admin/stores/$storeId/points",
                    label: "customer_points_policy",
                    Icon: Gift,
                  },
                  { to: "/admin/stores/$storeId/coupons", label: "coupons", Icon: Gift },
                ],
              },
              {
                label: "nav_store_management",
                items: [
                  { to: "/admin/stores/$storeId/members", label: "org_members", Icon: Users },
                  {
                    to: "/admin/stores/$storeId/devices",
                    label: "device_title",
                    Icon: MonitorSmartphone,
                  },
                  { to: "/admin/stores/$storeId/profile", label: "store_profile", Icon: Store },
                ],
              },
            ] as const
          ).map((group) => (
            <section key={group.label} className="space-y-1 pt-4" aria-label={t(group.label)}>
              {!collapsed && (
                <h2 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
                  {t(group.label)}
                </h2>
              )}
              {group.items.map(({ to, label, Icon }) => (
                <Link
                  key={to}
                  className={sidebarItemClass}
                  to={to}
                  params={{ storeId: selectedStore }}
                  title={t(label)}
                  onClick={onNavigate}
                >
                  <Icon className="size-5 shrink-0" />
                  {!collapsed && t(label)}
                </Link>
              ))}
              {group.label === "nav_store_management" && (
                <BillingNavigation
                  organizationId={selectedOrganization}
                  tab={tab}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
            </section>
          ))}
        </>
      )}
      <div className="h-4" />
      {!collapsed && (
        <p className="px-2 pb-2 text-sm font-medium text-muted-foreground">{t("nav_management")}</p>
      )}
      <Link
        className={sidebarItemClass}
        to="/organisations"
        title={t("stores_title")}
        aria-label={t("stores_title")}
        aria-current={tab === "organisations" ? "page" : undefined}
        onClick={onNavigate}
      >
        <Building2 className="size-5 shrink-0" />
        {!collapsed && t("stores_title")}
      </Link>
      <Link
        className={sidebarItemClass}
        to="/account/mcp-sessions"
        data-status={tab === "mcp" ? "active" : undefined}
        onClick={onNavigate}
        title={t("mcp_sessions")}
      >
        <Plug className="size-5 shrink-0" />
        {!collapsed && t("mcp_sessions")}
      </Link>
      <Link
        className={sidebarItemClass}
        to="/account"
        activeOptions={{ exact: true }}
        title={t("account_title")}
        aria-label={t("account_title")}
        aria-current={tab === "account" ? "page" : undefined}
        onClick={onNavigate}
      >
        <UserRound className="size-5 shrink-0" />
        {!collapsed && t("account_title")}
      </Link>
    </nav>
  );
}

function BillingNavigation({
  organizationId: selectedOrganization,
  tab,
  collapsed,
  onNavigate,
}: {
  organizationId?: string;
  tab: AdminSidebarProps["tab"];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  if (!selectedOrganization) return null;
  return (
    <Link
      className={sidebarItemClass}
      to="/billing/$organizationId"
      params={{ organizationId: selectedOrganization }}
      title={t("billing_title")}
      aria-label={t("billing_title")}
      aria-current={tab === "billing" ? "page" : undefined}
      onClick={onNavigate}
    >
      <CreditCard className="size-5 shrink-0" />
      {!collapsed && t("billing_title")}
    </Link>
  );
}

export function StorePicker({
  stores,
  selectedStore,
  pending,
  onChange,
  collapsed = false,
  error,
}: {
  stores: Awaited<ReturnType<typeof loadStores>>["stores"];
  selectedStore?: string;
  pending: boolean;
  onChange: (id: string) => void;
  collapsed?: boolean;
  error?: unknown;
}) {
  const { t } = useI18n();
  const selected = stores.find((item) => item.id === selectedStore);
  return (
    <div className="min-w-0 space-y-2">
      <Select
        items={stores.map((store) => ({ value: store.id, label: store.name }))}
        value={selectedStore ?? null}
        disabled={pending}
        onValueChange={(value) => {
          if (value) onChange(value);
        }}
      >
        <SelectTrigger
          className={`min-w-0 justify-start border-0 bg-transparent shadow-none hover:bg-secondary ${collapsed ? "gap-1 px-1" : "px-2"}`}
          aria-label={t("stores_title")}
          title={selected?.name}
        >
          <StoreIcon
            name={selected?.name ?? t("admin_store")}
            logo={selected?.logo}
            className={collapsed ? "size-7" : undefined}
          />
          <SelectValue
            className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate text-left"}
            placeholder={t("stores_title")}
          />
        </SelectTrigger>
        <SelectContent>
          {stores.map((store) => (
            <SelectItem key={store.id} value={store.id}>
              <span className="flex items-center gap-2">
                <StoreIcon name={store.name} logo={store.logo} />
                {store.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!!error && (
        <p
          role="alert"
          className="flex items-center gap-2 px-2 text-sm text-destructive"
          title={t("account_failed")}
        >
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          <span className={collapsed ? "sr-only" : undefined}>{t("account_failed")}</span>
        </p>
      )}
    </div>
  );
}

function SidebarUserMenu({
  user,
  collapsed,
  onSignOut,
  signingOut,
}: { user?: Parameters<typeof UserIdentity>[0]["user"]; collapsed: boolean } & Pick<
  AdminSidebarProps,
  "onSignOut" | "signingOut"
>) {
  const { t } = useI18n();
  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex w-full min-w-0 items-center gap-2 rounded-lg p-2 text-left hover:bg-secondary"
        aria-label={t("account_title")}
        title={user?.name}
      >
        {user &&
          (collapsed ? (
            <UserRound className="size-4" />
          ) : (
            <>
              <UserIdentity user={user} compact />
              <ChevronsUpDown className="ml-auto size-4 shrink-0" />
            </>
          ))}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50">
          <Menu.Popup className="w-64 rounded-xl border border-border bg-white p-1 shadow-lg">
            {user && (
              <div className="border-b border-border p-2">
                <UserIdentity user={user} compact />
              </div>
            )}
            <Menu.Item render={<Link to="/account" />} className={sidebarItemClass}>
              <UserRound className="size-4" />
              {t("account_title")}
            </Menu.Item>
            <Menu.Item
              render={<Button variant="ghost" />}
              className={sidebarItemClass}
              disabled={signingOut}
              onClick={
                onSignOut ??
                (() => {
                  void authClient.signOut().then(() => window.location.assign("/login"));
                })
              }
            >
              <LogOut className="size-4" />
              {t("auth_sign_out")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function OverviewNavigation({
  storeId,
  manager,
  collapsed,
  onNavigate,
}: {
  storeId: string;
  manager: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <Link
        className={sidebarItemClass}
        to="/admin/stores/$storeId"
        params={{ storeId: storeId }}
        activeOptions={{ exact: true }}
        onClick={onNavigate}
        title={t("home_title")}
        aria-label={t("home_title")}
      >
        <House className="size-5 shrink-0" />
        {!collapsed && t("home_title")}
      </Link>
      {manager && (
        <Link
          className={sidebarItemClass}
          to="/admin/stores/$storeId/statistics"
          params={{ storeId: storeId }}
          search={{ period: "today", view: "summary" }}
          onClick={onNavigate}
          title={t("statistics_title")}
          aria-label={t("statistics_title")}
        >
          <ChartNoAxesCombined className="size-5 shrink-0" />
          {!collapsed && t("statistics_title")}
        </Link>
      )}
    </>
  );
}
