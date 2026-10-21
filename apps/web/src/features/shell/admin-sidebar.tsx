import { controlMotion, surfaceMotion } from "../../components/ui/motion-variants";
import { cn } from "tailwind-variants";
import { Brand } from "../../components/brand";
import { Menu } from "@base-ui/react/menu";
import { Tooltip } from "@base-ui/react/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  AudioLines,
  ChevronsUpDown,
  CircleAlert,
  LogOut,
  Tablet,
  UserRound,
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
import { NavigationLink, SidebarTooltip } from "./navigation-link";
import { SidebarNavigation } from "./sidebar-navigation";
import { navigationItemClass as sidebarItemClass } from "./navigation-group";
import { useSidebarPreferences } from "./sidebar-preferences";
import { useConfigurationRoute } from "./configuration-route";
import { storesOptions, type loadStores } from "../store/store-query";

import { authClient, authResult } from "../../lib/auth-client";

type Tab = "live" | "history" | "settings";
export type AdminSidebarProps = {
  tab: Tab | "account" | "organisations" | "mcp" | "billing";
  storeId?: string;
  organizationId?: string;
  onSignOut?: () => void;
  signingOut?: boolean;
  renderStorePicker?: (options: { collapsed: boolean; onNavigate?: () => void }) => ReactNode;
};
export function AdminSidebar({
  tab,
  onSignOut,
  signingOut,
  renderStorePicker,
  collapsed = false,
  selection,
  onNavigate,
}: AdminSidebarProps & {
  collapsed?: boolean;
  onNavigate?: () => void;
  selection: ReturnType<typeof useSidebarStore>;
}) {
  const { t } = useI18n();
  const { draftId } = useConfigurationRoute();
  const { session, stores, availableStores, selectedStore, selectedOrganization, change, manager } =
    selection;

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
            pending={stores.isPending || change.isPending}
            error={stores.error ?? change.error}
            collapsed={collapsed}
            onChange={(id) => change.mutate(id, { onSuccess: () => onNavigate?.() })}
          />
        )}
      </div>
      <SidebarNavigation
        tab={tab}
        selectedStore={selectedStore}
        manager={manager}
        selectedOrganization={selectedOrganization}
        userId={session.data?.user.id}
        collapsed={collapsed}
        onNavigate={onNavigate}
        draftId={draftId}
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
          user={session.data?.user}
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
  storeId: string;
  collapsed: boolean;
  className: string;
  onNavigate?: () => void;
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
        <SidebarTooltip label={selected?.name ?? t("stores_title")} collapsed={collapsed}>
          <SelectTrigger
            showIndicator={!collapsed}
            className={`min-w-0 border-0 bg-transparent shadow-none hover:bg-control-hover ${collapsed ? "justify-center px-0" : "justify-start px-2"}`}
            aria-label={t("stores_title")}
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
        </SidebarTooltip>
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
      <SidebarTooltip label={t("account_title")} collapsed={collapsed}>
        <Menu.Trigger
          className={`${controlMotion} flex min-h-14 w-full min-w-0 items-center gap-2 rounded-xl border border-transparent text-left outline-none hover:border-control-edge hover:bg-control-hover data-popup-open:border-control-edge data-popup-open:bg-control-selected focus-visible:ring-2 focus-visible:ring-ring ${collapsed ? "justify-center p-0" : "p-2"}`}
          aria-label={t("account_title")}
        >
          {collapsed || !user ? (
            <UserRound className="size-5 shrink-0" />
          ) : (
            <>
              <span className="min-w-0 flex-1">
                <UserIdentity user={user} compact truncate />
              </span>
              <ChevronsUpDown className="ml-auto size-4 shrink-0" />
            </>
          )}
        </Menu.Trigger>
      </SidebarTooltip>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50">
          <Menu.Popup
            render={(renderProps, state) => (
              <div {...renderProps} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            className={cn(
              "w-80 max-w-[var(--available-width)] rounded-2xl border border-border bg-card p-2 shadow-surface",
              surfaceMotion(),
            )}
          >
            {user && (
              <div className="mb-2 border-b border-border p-3">
                <UserIdentity user={user} compact />
              </div>
            )}
            <Menu.Item
              render={<Link to="/account" />}
              className={`${sidebarItemClass} justify-start`}
            >
              <UserRound className="size-4" />
              {t("account_title")}
            </Menu.Item>
            <Menu.Item
              nativeButton
              render={<Button variant="ghost" />}
              className={`${sidebarItemClass} justify-start`}
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

export function useSidebarStore({
  storeId,
  organizationId,
  tab,
}: Pick<AdminSidebarProps, "storeId" | "organizationId" | "tab">) {
  const session = useQuery(sessionOptions);
  const stores = useQuery({ ...storesOptions, enabled: !!session.data });
  const availableStores = stores.data?.stores ?? [];
  const { preferences, update } = useSidebarPreferences(session.data?.user.id);
  const activeOrganization = organizationId ?? session.data?.session?.activeOrganizationId;
  const remembered = availableStores.find((store) => store.id === preferences.storeId);
  const selected =
    availableStores.find((store) => store.id === storeId) ??
    (organizationId
      ? availableStores.find((store) => store.organizationId === organizationId)
      : (remembered ??
        availableStores.find((store) => store.organizationId === activeOrganization)));
  const selectedStore = storeId ?? selected?.id;
  const selectedOrganization =
    organizationId ?? selected?.organizationId ?? activeOrganization ?? undefined;
  const client = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    if (selected && preferences.storeId !== selected.id) update({ storeId: selected.id });
  }, [selected, preferences.storeId, update]);
  const change = useMutation({
    mutationFn: async (id: string) => {
      const next = availableStores.find((store) => store.id === id);
      if (!next) throw new Error("STORE_NOT_FOUND");
      authResult(await authClient.organization.setActive({ organizationId: next.organizationId }));
      return next;
    },
    onSuccess: async (next) => {
      update({ storeId: next.id });
      client.setQueryData(sessionOptions.queryKey, (current) => {
        if (!current) return current;
        const updated = structuredClone(current);
        updated.session.activeOrganizationId = next.organizationId;
        return updated;
      });
      await client.invalidateQueries({ queryKey: ["tablecast-membership"] });
      await navigate(
        tab === "billing"
          ? { to: "/billing/$organizationId", params: { organizationId: next.organizationId } }
          : { to: "/admin/stores/$storeId", params: { storeId: next.id } },
      );
    },
  });

  return {
    session,
    stores,
    availableStores,
    selectedStore,
    selectedOrganization,
    change,
    manager: ["owner", "admin"].includes(selected?.role ?? ""),
  };
}
