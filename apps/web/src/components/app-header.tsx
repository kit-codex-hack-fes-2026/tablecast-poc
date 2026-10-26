import type { Locale } from "@tablecast/api/schema";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "tailwind-variants";
import { LanguageSwitch } from "./language-switch";

/** ナビゲーションとページの文脈を置き、言語操作を共通の位置に揃える。 */
export function AppHeader({
  navigation,
  context,
  children,
  onLocaleChange,
  className,
  ...props
}: Omit<ComponentProps<"header">, "onChange"> & {
  context?: ReactNode;
  navigation?: ReactNode;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <header
      {...props}
      data-ui="app-header"
      className={cn(
        "sticky top-0 z-20 flex min-h-18 flex-wrap items-center gap-3 border-b border-border bg-glass px-4 py-3 backdrop-blur-xl @container",
        className,
      )}
    >
      {navigation}
      {context}
      {children && (
        <div className="order-last min-w-0 basis-full text-base font-medium @3xl:order-0 @3xl:flex-1 @3xl:basis-72">
          {children}
        </div>
      )}
      <div className="ml-auto">
        <LanguageSwitch onChange={onLocaleChange} />
      </div>
    </header>
  );
}
