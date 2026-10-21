import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Brand } from "../../components/brand";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";

export function CustomerShell({ children }: { children: ReactNode }) {
  const { t, setLocale } = useI18n();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl space-y-6 px-5 pb-12 pt-5 sm:px-8 sm:pt-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/member" className="inline-flex min-h-11 items-center">
          <Brand variant="symbol" />
        </Link>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <nav
        aria-label={t("customer_navigation")}
        className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 pb-2 text-sm"
      >
        <Link
          to="/member"
          className="inline-flex min-h-11 items-center font-medium hover:text-primary"
          activeOptions={{ exact: true }}
          activeProps={{ className: "text-primary" }}
        >
          {t("customer_title")}
        </Link>
        <Link
          to="/account"
          className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground"
        >
          {t("customer_account")}
        </Link>
      </nav>
      <div data-page-motion className="space-y-6 [view-transition-name:tablecast-page]">
        {children}
      </div>
    </main>
  );
}
