import { Collapsible } from "@base-ui/react/collapsible";
import { Menu } from "@base-ui/react/menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useHydrated, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  ChevronsUpDown,
  History,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Plug,
  Settings2,
  Tablet,
  Store,
  UserRound,
  Users,
  UtensilsCrossed,
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
import { storesOptions } from "../store/store-query";

import { authClient, authResult } from "../../lib/auth-client";

type Tab = "live" | "history" | "settings";
export type AdminSidebarProps = {
  tab: Tab | "account" | "organisations" | "mcp";
  storeId?: string;
  onSignOut?: () => void;
  signingOut?: boolean;
};
export function AdminSidebar({
  tab,
  storeId,
  onSignOut,
  signingOut,
  collapsed = false,
  onNavigate,
}: AdminSidebarProps & { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const session = useQuery(sessionOptions);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { draftId } = useParams({ strict: false });
  const inMenu = path.includes("/menu/");
  const navigate = useNavigate();
  const client = useQueryClient();
  const active = authClient.useActiveOrganization();
  const stores = useQuery({ ...storesOptions, enabled: !!session.data });
  const selectedStore =
    storeId ??
    stores.data?.stores.find((store) => store.organizationId === active.data?.id)?.id ??
    stores.data?.stores[0]?.id;
  const changeOrganisation = useMutation({
    mutationFn: async (nextStoreId: string) => {
      const store = stores.data?.stores.find((item) => item.id === nextStoreId);
      if (!store) throw new Error("STORE_NOT_FOUND");
      authResult(await authClient.organization.setActive({ organizationId: store.organizationId }));
      return nextStoreId;
    },
    onSuccess: async (nextStoreId) => {
      await client.invalidateQueries({ queryKey: ["tablecast-membership"] });
      await navigate({ to: "/admin/stores/$storeId/floor", params: { storeId: nextStoreId } });
    },
  });
  const item =
    "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-base text-foreground hover:bg-secondary aria-[current=page]:bg-secondary aria-[current=page]:font-medium data-[status=active]:bg-secondary data-[status=active]:font-medium";
  return (
    <>
      <Link
        to="/admin/live"
        className="flex h-14 shrink-0 items-center gap-2 px-2 font-semibold"
        onClick={onNavigate}
        title="TableCast"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <UtensilsCrossed className="size-4" />
        </span>
        {!collapsed && "TableCast"}
      </Link>
      {!collapsed && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-white p-2">
          <StoreIcon
            name={
              stores.data?.stores.find((store) => store.id === selectedStore)?.name ??
              t("admin_store")
            }
            logo={stores.data?.stores.find((store) => store.id === selectedStore)?.logo}
          />
          <Select
            items={
              stores.data?.stores.map((store) => ({ value: store.id, label: store.name })) ?? []
            }
            value={selectedStore ?? null}
            disabled={changeOrganisation.isPending}
            onValueChange={(value) => {
              if (value) changeOrganisation.mutate(value);
            }}
          >
            <SelectTrigger
              className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none"
              aria-label={t("stores_title")}
            >
              <SelectValue placeholder={t("stores_title")} />
            </SelectTrigger>
            <SelectContent>
              {stores.data?.stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  <span className="flex items-center gap-2">
                    <StoreIcon name={store.name} logo={store.logo} />
                    {store.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {changeOrganisation.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("account_failed")}
        </p>
      )}
      <nav
        className="flex-1 space-y-1 overflow-y-auto border-t border-border py-3"
        aria-label={t("admin_navigation")}
      >
        {!collapsed && (
          <p className="px-2 pb-2 text-sm font-medium text-muted-foreground">{t("admin_store")}</p>
        )}
        {selectedStore ? (
          <>
            <Link
              className={item}
              to="/admin/stores/$storeId/floor"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("admin_live")}
            >
              <LayoutDashboard className="size-5 shrink-0" />
              {!collapsed && t("admin_live")}
            </Link>
            <Link
              className={item}
              to="/admin/stores/$storeId/visits"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("admin_history")}
            >
              <History className="size-5 shrink-0" />
              {!collapsed && t("admin_history")}
            </Link>
            {collapsed ? (
              <Link
                className={item}
                to="/admin/stores/$storeId/menu/$section"
                params={{ storeId: selectedStore, section: "products" }}
                title={t("admin_config")}
                onClick={onNavigate}
              >
                <Settings2 className="size-5 shrink-0" />
              </Link>
            ) : (
              <Collapsible.Root key={String(inMenu)} defaultOpen={inMenu}>
                <Collapsible.Trigger disabled={!hydrated} className={`${item} group`}>
                  <Settings2 className="size-5 shrink-0" />
                  {t("admin_config")}
                  <ChevronRight className="ml-auto size-4 shrink-0 group-aria-expanded:rotate-90" />
                </Collapsible.Trigger>
                <Collapsible.Panel>
                  <MenuNavigation
                    storeId={selectedStore}
                    draftId={draftId}
                    onNavigate={onNavigate}
                  />
                </Collapsible.Panel>
              </Collapsible.Root>
            )}
            <Link
              className={item}
              to="/admin/stores/$storeId/members"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("org_members")}
            >
              <Users className="size-5 shrink-0" />
              {!collapsed && t("org_members")}
            </Link>
            <Link
              className={item}
              to="/admin/stores/$storeId/devices"
              params={{ storeId: selectedStore }}
              onClick={onNavigate}
              title={t("device_title")}
            >
              <MonitorSmartphone className="size-5 shrink-0" />
              {!collapsed && t("device_title")}
            </Link>
            <Link
              className={item}
              to="/admin/stores/$storeId/profile"
              params={{ storeId: selectedStore }}
              title={t("store_profile")}
              onClick={onNavigate}
            >
              <Store className="size-5 shrink-0" />
              {!collapsed && t("store_profile")}
            </Link>
          </>
        ) : (
          <Link className={item} to="/organisations" onClick={onNavigate}>
            <Building2 className="size-5 shrink-0" />
            {!collapsed && t("org_manage")}
          </Link>
        )}
        <div className="h-4" />
        {!collapsed && (
          <p className="px-2 pb-2 text-sm font-medium text-muted-foreground">
            {t("nav_management")}
          </p>
        )}
        <Link
          className={item}
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
          className={item}
          to="/account/mcp-sessions"
          data-status={tab === "mcp" ? "active" : undefined}
          onClick={onNavigate}
          title={t("mcp_sessions")}
        >
          <Plug className="size-5 shrink-0" />
          {!collapsed && t("mcp_sessions")}
        </Link>
        <Link
          className={item}
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
      <div className="space-y-2 border-t border-border py-3">
        {selectedStore &&
          ["owner", "admin"].includes(
            stores.data?.stores.find((store) => store.id === selectedStore)?.role ?? "",
          ) && (
            <DemoLink
              storeId={selectedStore}
              collapsed={collapsed}
              className={item}
              onNavigate={onNavigate}
            />
          )}
        <Link
          className={item}
          to="/"
          title={t("auth_guest")}
          aria-label={t("auth_guest")}
          onClick={onNavigate}
        >
          <ArrowUpRight className="size-5 shrink-0" />
          {!collapsed && t("auth_guest")}
        </Link>
        <Menu.Root>
          <Menu.Trigger
            className="flex w-full min-w-0 items-center gap-2 rounded-lg p-2 text-left hover:bg-secondary"
            aria-label={t("account_title")}
            title={session.data?.user.name}
          >
            {session.data &&
              (collapsed ? (
                <UserRound className="size-4" />
              ) : (
                <>
                  <UserIdentity user={session.data.user} compact />
                  <ChevronsUpDown className="ml-auto size-4 shrink-0" />
                </>
              ))}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50">
              <Menu.Popup className="w-64 rounded-xl border border-border bg-white p-1 shadow-lg">
                {session.data && (
                  <div className="border-b border-border p-2">
                    <UserIdentity user={session.data.user} compact />
                  </div>
                )}
                <Menu.Item render={<Link to="/account" />} className={item}>
                  <UserRound className="size-4" />
                  {t("account_title")}
                </Menu.Item>
                <Menu.Item
                  render={<Button variant="ghost" />}
                  className={item}
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
