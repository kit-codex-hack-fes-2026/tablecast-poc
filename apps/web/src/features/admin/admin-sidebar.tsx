import { Menu } from "@base-ui/react/menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  ChevronsUpDown,
  History,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Settings2,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";

type Tab = "live" | "history" | "settings";
export type AdminSidebarProps = {
  tab: Tab | "account" | "organisations";
  onTabChange?: (tab: Tab) => void;
  onPair?: () => void;
  pairDisabled?: boolean;
  onSignOut?: () => void;
  signingOut?: boolean;
};
export function AdminSidebar({
  tab,
  onTabChange,
  onPair,
  pairDisabled,
  onSignOut,
  signingOut,
  collapsed = false,
  onNavigate,
}: AdminSidebarProps & { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const session = authClient.useSession();
  const active = authClient.useActiveOrganization();
  const organisations = useQuery({
    queryKey: ["tablecast-organisations"],
    queryFn: async () => authResult(await authClient.organization.list()),
    enabled: !!session.data,
  });
  const changeOrganisation = useMutation({
    mutationFn: async (organizationId: string) =>
      authResult(await authClient.organization.setActive({ organizationId })),
  });
  const item =
    "flex h-auto min-h-11 w-full items-center justify-start gap-2 whitespace-normal text-left rounded-md px-2 text-base text-foreground hover:bg-secondary aria-[current=page]:bg-secondary aria-[current=page]:font-medium";
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
          <Building2 className="size-8 shrink-0 rounded-md bg-secondary p-1.5" />
          <NativeSelect
            className="h-9 min-w-0 flex-1 border-0 bg-transparent p-0 text-base shadow-none"
            aria-label={t("org_select")}
            value={active.data?.id ?? organisations.data?.[0]?.id ?? ""}
            disabled={changeOrganisation.isPending}
            onChange={(event) => changeOrganisation.mutate(event.target.value)}
          >
            <option value="" disabled>
              {t("org_select")}
            </option>
            {organisations.data?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </NativeSelect>
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
        {(
          [
            { key: "live", label: t("admin_live"), Icon: LayoutDashboard },
            { key: "history", label: t("admin_history"), Icon: History },
            { key: "settings", label: t("admin_config"), Icon: Settings2 },
          ] as const
        ).map(({ key, label, Icon }) =>
          onTabChange ? (
            <Button
              variant="ghost"
              key={key}
              className={item}
              title={label}
              aria-label={label}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                onTabChange(key);
                onNavigate?.();
              }}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && label}
            </Button>
          ) : (
            <Link
              key={key}
              className={item}
              title={label}
              aria-label={label}
              to="/admin/live"
              search={{ section: key }}
              onClick={onNavigate}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && label}
            </Link>
          ),
        )}
        {onPair ? (
          <Button
            variant="ghost"
            className={item}
            disabled={pairDisabled}
            title={t("admin_pair")}
            aria-label={t("admin_pair")}
            onClick={() => {
              onPair();
              onNavigate?.();
            }}
          >
            <MonitorSmartphone className="size-5 shrink-0" />
            {!collapsed && t("admin_pair")}
          </Button>
        ) : (
          <Link
            className={item}
            to="/device"
            title={t("admin_pair")}
            aria-label={t("admin_pair")}
            onClick={onNavigate}
          >
            <MonitorSmartphone className="size-5 shrink-0" />
            {!collapsed && t("admin_pair")}
          </Link>
        )}
        <div className="h-4" />
        {!collapsed && (
          <p className="px-2 pb-2 text-sm font-medium text-muted-foreground">{t("org_title")}</p>
        )}
        <Link
          className={item}
          to="/organisations"
          title={t("org_title")}
          aria-label={t("org_title")}
          aria-current={tab === "organisations" ? "page" : undefined}
          onClick={onNavigate}
        >
          <Building2 className="size-5 shrink-0" />
          {!collapsed && t("org_members")}
        </Link>
        <Link
          className={item}
          to="/account"
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
