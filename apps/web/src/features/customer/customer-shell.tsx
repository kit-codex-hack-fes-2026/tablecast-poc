import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Brand } from "../../components/brand";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";

export function CustomerShell({ children }: { children: ReactNode }) {
  const { t, setLocale } = useI18n();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl space-y-5 px-4 pb-10 pt-3 sm:px-8 sm:pt-5">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <nav aria-label={t("customer_navigation")} className="flex items-center gap-3 text-xs">
          <Link
            to="/member"
            className="inline-flex min-h-11 items-center gap-2 font-medium hover:text-primary"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-primary" }}
          >
            <Brand variant="symbol" />
            {t("customer_title")}
          </Link>
          <Link
            to="/account"
            className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground"
          >
            {t("customer_account")}
          </Link>
        </nav>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <div data-page-motion className="space-y-6 [view-transition-name:tablecast-page]">
        {children}
      </div>
    </main>
  );
}
