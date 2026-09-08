import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";
import { authClient } from "../../lib/auth-client";

export function SettingsShell({ children }: { children: ReactNode }) {
  const { t, setLocale } = useI18n();
  const session = authClient.useSession();
  useEffect(() => {
    if (!session.isPending && !session.data)
      window.location.assign(
        `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
  }, [session.isPending, session.data]);
  if (!session.data)
    return (
      <main className="p-8" aria-busy="true">
        {t("account_loading")}
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 sm:p-10">
      <header className="flex items-center justify-between gap-4">
        <Link to="/admin/live" className="text-2xl font-bold tracking-tight">
          TableCast
        </Link>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <nav className="flex flex-wrap gap-4 border-b border-border pb-4">
        <Link to="/admin/live">{t("admin_live")}</Link>
        <Link to="/account">{t("account_title")}</Link>
        <Link to="/organisations">{t("org_title")}</Link>
      </nav>
      {children}
    </main>
  );
}
