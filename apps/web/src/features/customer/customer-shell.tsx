import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Brand } from "../../components/brand";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";

export function CustomerShell({ children }: { children: ReactNode }) {
  const { t, setLocale } = useI18n();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl space-y-8 px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <Link to="/member">
          <Brand />
        </Link>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <nav aria-label={t("customer_navigation")} className="flex items-center gap-5 text-sm">
        <Link to="/member" className="underline underline-offset-4">
          {t("customer_title")}
        </Link>
        <Link to="/account" className="text-muted-foreground underline underline-offset-4">
          {t("customer_account")}
        </Link>
      </nav>
      {children}
    </main>
  );
}
