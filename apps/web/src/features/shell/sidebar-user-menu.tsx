import { Menu } from "@base-ui/react/menu";
import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { cn } from "tailwind-variants";
import type { AdminSidebarProps } from "./admin-sidebar";
import { Button } from "../../components/ui/button";
import { controlMotion, surfaceMotion } from "../../components/ui/motion-variants";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { navigationItemClass as sidebarItemClass } from "./navigation-group";
import { SidebarTooltip } from "./navigation-link";

export function SidebarUserMenu({
  user,
  collapsed,
  onSignOut,
  signingOut,
}: Pick<AdminSidebarProps, "onSignOut" | "signingOut"> & {
  collapsed: boolean;
  user?: Parameters<typeof UserIdentity>[0]["user"];
}) {
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
              onClick={onSignOut}
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
