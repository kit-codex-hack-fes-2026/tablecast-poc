import { PanelLeft, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LanguageSwitch } from "../../components/language-switch";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";

import { AdminSidebar, type AdminSidebarProps } from "./admin-sidebar";

export function AdminShell({
  children,
  header,
  ...sidebar
}: AdminSidebarProps & { children: ReactNode; header?: ReactNode }) {
  const { t, setLocale } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-secondary/50 md:flex md:gap-2 md:p-2">
      <aside
        className={`${collapsed ? "w-14" : "w-64"} sticky top-2 hidden h-[calc(100dvh-1rem)] shrink-0 flex-col px-2 md:flex`}
      >
        <AdminSidebar {...sidebar} collapsed={collapsed} />
      </aside>
      <main className="min-w-0 flex-1 bg-white md:rounded-2xl md:border md:border-border">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur-sm md:top-2 md:rounded-t-2xl">
          <Button
            size="icon"
            variant="ghost"
            className="hidden md:inline-flex"
            aria-label={t("admin_navigation")}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeft />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            aria-label={t("admin_navigation")}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <PanelLeft />
          </Button>
          <div className="min-w-0 flex-1 truncate border-l border-border pl-3 text-base font-medium">
            {header ??
              t(
                sidebar.tab === "organisations"
                  ? "stores_title"
                  : sidebar.tab === "mcp"
                    ? "mcp_sessions"
                    : "account_title",
              )}
          </div>
          <LanguageSwitch onChange={setLocale} />
        </header>
        <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent side="left" className="max-w-72 p-3">
          <DialogTitle className="sr-only">{t("admin_navigation")}</DialogTitle>
          <Button
            className="absolute right-2 top-3"
            size="icon"
            variant="ghost"
            aria-label={t("common_close")}
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </Button>
          <AdminSidebar {...sidebar} onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
