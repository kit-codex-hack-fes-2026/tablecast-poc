import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  History,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Settings2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

const navigationButton =
  "flex min-h-12 items-center gap-2 rounded-md p-3 text-left text-xs text-muted-foreground aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground max-sm:h-auto max-sm:min-w-0 max-sm:flex-col max-sm:gap-1 max-sm:p-2 max-sm:whitespace-normal max-sm:text-center";
export function AdminSidebar({
  tab,
  onTabChange,
  onPair,
  pairDisabled,
  onSignOut,
  signingOut,
}: {
  tab: "live" | "history" | "settings";
  onTabChange: (tab: "live" | "history" | "settings") => void;
  onPair: () => void;
  pairDisabled: boolean;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 flex h-dvh w-52 shrink-0 flex-col border-r border-border bg-muted p-6 max-lg:w-44 max-lg:p-4 max-sm:relative max-sm:h-auto max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-4 max-sm:border-r-0 max-sm:border-b">
      <Link
        className="brand inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight max-lg:text-2xl"
        to="/admin/live"
      >
        TableCast<span className="text-accent ml-px text-4xl">·</span>
      </Link>
      <nav
        className="mt-14 flex flex-col gap-1.5 max-sm:grid max-sm:grid-cols-4 max-sm:m-0 max-sm:gap-1"
        aria-label={t("admin_live")}
      >
        <Button
          className={navigationButton}
          variant="ghost"
          type="button"
          aria-current={tab === "live" ? "page" : undefined}
          onClick={() => onTabChange("live")}
        >
          <LayoutDashboard size={19} aria-hidden="true" />
          {t("admin_live")}
        </Button>
        <Button
          className={navigationButton}
          variant="ghost"
          type="button"
          aria-current={tab === "history" ? "page" : undefined}
          onClick={() => onTabChange("history")}
        >
          <History size={19} aria-hidden="true" />
          {t("admin_history")}
        </Button>
        <Button
          className={navigationButton}
          variant="ghost"
          type="button"
          aria-current={tab === "settings" ? "page" : undefined}
          onClick={() => onTabChange("settings")}
        >
          <Settings2 size={19} aria-hidden="true" />
          {t("admin_config")}
        </Button>
        <Button
          className={navigationButton}
          variant="ghost"
          type="button"
          onClick={onPair}
          disabled={pairDisabled}
        >
          <MonitorSmartphone size={19} aria-hidden="true" />
          {t("admin_pair")}
        </Button>
      </nav>
      <div className="mt-auto pt-5 border-t border-t-border flex flex-col gap-2 [&_>_a]:flex [&_>_a]:items-center [&_>_a]:justify-between [&_>_a]:min-h-9 [&_>_a]:text-xs [&_>_a]:text-muted-foreground [&_>_a]:text-left max-sm:hidden">
        <Link to="/">
          {t("auth_guest")}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <Button
          className="flex items-center justify-start min-h-9 text-xs text-muted-foreground text-left gap-2"
          variant="ghost"
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
        >
          <LogOut size={16} aria-hidden="true" />
          {t("auth_sign_out")}
        </Button>
      </div>
    </aside>
  );
}
