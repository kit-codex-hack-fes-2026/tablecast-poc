import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Brand } from "../../components/brand";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";

export function AuthLayout({
  title,
  children,
  footer,
  onLocaleChange,
}: {
  children: ReactNode;
  footer?: ReactNode;
  onLocaleChange?: (locale: "en" | "ja") => void;
  title: ReactNode;
}) {
  const { setLocale } = useI18n();
  return (
    <main className="min-h-dvh px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-112">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <Link to="/" className="inline-flex shrink-0 items-center" data-ui="brand">
            <Brand />
          </Link>
          <LanguageSwitch onChange={onLocaleChange ?? setLocale} />
        </header>
        <section
          data-page-motion
          className="min-w-0 pt-10 sm:pt-14 [view-transition-name:tablecast-page]"
        >
          <h1 className="mb-7 text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </section>
        {footer && (
          <footer className="mt-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border pt-5 text-sm">
            {footer}
          </footer>
        )}
      </div>
    </main>
  );
}
