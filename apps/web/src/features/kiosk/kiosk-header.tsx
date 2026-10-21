import type { TableState, ThemeImage } from "@tablecast/api/schema";
import { useHydrated } from "@tanstack/react-router";
import { Bell, ReceiptText, ShoppingBag, Utensils, Wallet } from "lucide-react";
import { type ReactNode } from "react";
import type { useTableSession } from "./kiosk-session";
import { Brand } from "../../components/brand";
import { LanguageSwitch } from "../../components/language-switch";
import { StoreLogo } from "../../components/store-logo";
import { Button } from "../../components/ui/button";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { type TableEndpoint } from "../../lib/api";
import { CustomerVisitPanel } from "./customer-visit-panel";
import { KioskGames } from "./games";

export function KioskHeader({
  storeName,
  logo,
  data,
  language,
  call,
  tools,
}: {
  call: ReturnType<typeof useTableSession>["call"];
  data: TableState;
  language: ReturnType<typeof useTableSession>["language"];
  logo?: null | ThemeImage;
  storeName?: string;
  tools: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <header
      data-theme-part="header"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 max-[56rem]:grid max-[56rem]:grid-cols-[minmax(0,1fr)_auto] max-[56rem]:px-3"
    >
      <div className="mr-auto flex min-w-0 items-center gap-3">
        <a
          className="text-xl font-bold tracking-tight max-lg:hidden"
          href={data.kind === "demo" ? "#" : "/"}
        >
          <Brand />
        </a>
        <StoreLogo logo={logo} />
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm max-[56rem]:flex-col max-[56rem]:items-start max-[56rem]:gap-0">
          <span className="max-w-48 truncate max-[56rem]:max-w-full">
            {storeName ?? data.storeName}
          </span>
          <strong className="max-[56rem]:max-w-full max-[56rem]:truncate">
            {data.kind === "demo" ? t("demo_title") : data.tableName}
          </strong>
        </div>
      </div>
      <div className="max-[56rem]:justify-self-end">{tools}</div>
      <Button
        variant="outline"
        size="lg"
        className="h-auto whitespace-normal py-2 max-[56rem]:text-sm"
        onClick={() => call.mutate(false)}
        disabled={call.isPending || data.staffCalled}
      >
        <Bell />
        {data.staffCalled ? t("kiosk_called_staff") : t("kiosk_call_staff")}
      </Button>
      <div className="[&_[data-slot=button]]:h-auto [&_[data-slot=button]]:min-h-14">
        <LanguageSwitch onChange={(next) => language.mutate(next)} disabled={language.isPending} />
      </div>
    </header>
  );
}

export function KioskMenuTabs({ data }: { data: TableState }) {
  const hydrated = useHydrated();
  const { t } = useI18n();
  const quantity = data.cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <Tabs.List data-ui="menu-tabs" className="grid w-full grid-cols-2 sm:flex sm:w-fit">
      <Tabs.Tab size="guest" data-theme-part="menu-tab" disabled={!hydrated} value="menu">
        <Utensils aria-hidden />
        {t("kiosk_menu")}
      </Tabs.Tab>
      <Tabs.Tab size="guest" data-theme-part="menu-tab" disabled={!hydrated} value="cart">
        <ShoppingBag aria-hidden />
        {t("kiosk_cart")}
        <span
          key={quantity}
          data-ui="count"
          className="rounded-2xl py-px px-1 text-xs bg-secondary text-secondary-foreground motion-safe:animate-tablecast-confirm"
        >
          {quantity}
        </span>
      </Tabs.Tab>
      <Tabs.Tab size="guest" data-theme-part="menu-tab" disabled={!hydrated} value="orders">
        <ReceiptText aria-hidden />
        {t("kiosk_orders")}
      </Tabs.Tab>
      <Tabs.Tab size="guest" data-theme-part="menu-tab" disabled={!hydrated} value="bill">
        <Wallet aria-hidden />
        {t("kiosk_bill")}
      </Tabs.Tab>
    </Tabs.List>
  );
}

export function KioskVisitTools({
  data,
  endpoint,
  stopVoice,
}: {
  data: TableState;
  endpoint: TableEndpoint;
  stopVoice: () => Promise<void>;
}) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      {data.kind === "table" && (
        <CustomerVisitPanel
          key={data.id}
          endpoint={endpoint}
          sessionId={data.id}
          cursor={data.events.at(-1)?.cursor ?? 0}
        />
      )}
      <KioskGames
        endpoint={endpoint}
        locale={data.locale}
        players={data.guestCount}
        stopVoice={stopVoice}
      />
    </div>
  );
}
