import { Tabs } from "@base-ui/react/tabs";
import type {
  CartLine,
  Locale,
  PricedLine,
  Product,
  Snapshot,
  TableState,
} from "@tablecast/api/schema";
import {
  catalogSchema,
  orderSchema,
  snapshotSchema,
  tableStateSchema,
} from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChevronRight, Mic, MicOff, ShoppingBag, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScroll,
  DialogTitle,
} from "../../components/ui/dialog";
import { money, time, useI18n } from "../../i18n/locale";
import { api, ApiFailure, json } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { CartLines } from "./cart-lines";
import { ProductMenu } from "./menu";
import { Pairing } from "./pairing";
import { ProductDialog } from "./product-dialog";
import { VoiceConnection, type VoiceView } from "./voice-connection";
import { conversationLines, VoicePanel } from "./voice-panel";

const tableKey = ["tablecast-table"];

export function Kiosk() {
  const { t } = useI18n();
  const client = useQueryClient();
  const [wasConnected, setWasConnected] = useState(false);
  const table = useQuery({
    queryKey: tableKey,
    queryFn: async () => {
      try {
        const result = await api("/api/table", {}, tableStateSchema);
        setWasConnected(true);
        return result;
      } catch (error) {
        if (error instanceof ApiFailure && error.status === 401) return null;
        throw error;
      }
    },
    refetchInterval: (query) => (query.state.data === null ? 5000 : false),
  });
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: tableKey });
  }, [client]);
  if ((table.data === null && wasConnected) || table.data?.status === "closed")
    return (
      <main className="min-h-dvh flex justify-center items-center flex-col gap-7 p-8 text-center">
        <span className="brand inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight [&_span]:text-accent [&_span]:ml-px [&_span]:text-4xl max-lg:text-2xl">
          TableCast
        </span>
        <h1>{t("kiosk_closed")}</h1>
      </main>
    );
  if (table.data === null) return <Pairing onReady={refresh} />;
  if (!table.data)
    return (
      <main className="min-h-dvh flex justify-center items-center flex-col gap-7 p-8 text-center">
        <a
          className="brand inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight [&_span]:text-accent [&_span]:ml-px [&_span]:text-4xl max-lg:text-2xl"
          href="/"
        >
          TableCast
        </a>
        {table.isPending ? (
          <p>{t("common_loading")}</p>
        ) : (
          <ErrorNotice error={table.error} onRetry={refresh} />
        )}
      </main>
    );
  return <TableSession key={table.data.id} data={table.data} refresh={refresh} />;
}

function TableSession({ data, refresh }: { data: TableState; refresh: () => void }) {
  const { locale, setLocale, t } = useI18n();
  const client = useQueryClient();
  const catalog = useQuery({
    queryKey: ["tablecast-catalog", data.storeId, data.configVersion],
    queryFn: () => api("/api/table/catalog", {}, catalogSchema),
    enabled: true,
  });
  const [view, setView] = useState<VoiceView>({ status: "idle" });
  const [voice] = useState(() => new VoiceConnection(setView, refresh));
  const [chosen, setChosen] = useState<{
    product: Product;
    line?: CartLine;
    configVersion: number;
    cartVersion: number;
  }>();
  const [promptedCartVersion, setPromptedCartVersion] = useState(-1);
  const [prepared, setSnapshot] = useState<Snapshot>();
  const [ordered, setOrdered] = useState(false);
  const [section, setSection] = useState("menu");
  const [submitKey, setSubmitKey] = useState("");
  useRealtime("/api/table", data.cursor, refresh);
  const snapshot =
    prepared &&
    prepared.cartVersion === data.cart.version &&
    prepared.locale === data.locale &&
    data.snapshot?.id === prepared.id &&
    ["pending", "read"].includes(data.snapshot.status)
      ? prepared
      : undefined;
  useEffect(() => {
    setLocale(data.locale);
  }, [data.locale, setLocale]);
  useEffect(
    () => () => {
      void voice.stop();
    },
    [voice],
  );
  useEffect(() => {
    if (!prepared) return undefined;
    const timer = setTimeout(
      () => setSnapshot(undefined),
      Math.max(0, prepared.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [prepared]);
  useEffect(() => {
    voice.synchronise(data.voiceSessionId, data.voiceState === "active");
  }, [data.voiceSessionId, data.voiceState, voice]);
  const updateCart = useMutation({
    mutationFn: ({ lines, expectedVersion }: { lines: CartLine[]; expectedVersion: number }) =>
      api("/api/table/cart", json("PUT", { expectedVersion, lines }), tableStateSchema),
    onSuccess: (updated) => {
      setPromptedCartVersion(updated.cart.version);
      client.setQueryData(tableKey, updated);
      setChosen(undefined);
      setSnapshot(undefined);
    },
    onError: refresh,
  });
  const prepare = useMutation({
    mutationFn: () =>
      api(
        "/api/table/confirm",
        json("POST", { expectedVersion: data.cart.version, channel: "gui" }),
        snapshotSchema,
      ),
    onSuccess: (confirmation) => {
      client.setQueryData(tableKey, { ...data, snapshot: confirmation });
      setSnapshot(confirmation);
      setSubmitKey(crypto.randomUUID());
    },
    onError: refresh,
  });
  const submit = useMutation({
    mutationFn: () =>
      api(
        "/api/table/orders",
        json("POST", { snapshotId: snapshot?.id, idempotencyKey: submitKey, approved: true }),
        orderSchema,
      ),
    onSuccess: () => {
      setSnapshot(undefined);
      setOrdered(true);
      refresh();
    },
    onError: refresh,
  });
  const call = useMutation({
    mutationFn: (bill: boolean) =>
      api(bill ? "/api/table/bill/request" : "/api/table/call", json("POST", {}), tableStateSchema),
    onSuccess: (updated) => client.setQueryData(tableKey, updated),
  });
  const language = useMutation({
    mutationFn: async (next: Locale) => {
      await voice.stop({ existingSession: view.error === "active" });
      return api("/api/table/locale", json("PATCH", { locale: next }), tableStateSchema);
    },
    onSuccess: (updated) => {
      client.setQueryData(tableKey, updated);
      setLocale(updated.locale);
    },
    onError: refresh,
  });
  if (
    (!chosen || chosen.configVersion !== data.configVersion) &&
    !updateCart.isPending &&
    !snapshot &&
    !ordered &&
    catalog.data &&
    promptedCartVersion < data.cart.version
  ) {
    const line = data.cart.lines.find(
      (item) =>
        item.missing.length > 0 &&
        catalog.data.configuration.products.some(
          (product) => product.id === item.productId && product.available,
        ),
    );
    const product = catalog.data.configuration.products.find((item) => item.id === line?.productId);
    if (line && product) {
      // 同じ版の不足項目は一度だけ開き、閉じた操作や編集中の入力を尊重する。
      setPromptedCartVersion(data.cart.version);
      setChosen({
        product,
        line,
        configVersion: data.configVersion,
        cartVersion: data.cart.version,
      });
    }
  }
  function currentLines(): CartLine[] {
    return (
      data.cart.lines.map(({ id, productId, quantity, selections }) => ({
        id,
        productId,
        quantity,
        selections,
      })) ?? []
    );
  }
  function edit(line: PricedLine) {
    const product = catalog.data?.configuration.products.find((item) => item.id === line.productId);
    if (product) {
      updateCart.reset();
      setChosen({
        product,
        line,
        configVersion: data.configVersion,
        cartVersion: data.cart.version,
      });
    }
  }
  const voiceActive = view.error === "active" || !["idle", "paused", "error"].includes(view.status);

  return (
    <div className="kiosk-shell h-dvh flex flex-col overflow-hidden max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible">
      <header className="py-3.5 px-6 min-h-24 flex justify-between items-center gap-4 border-b border-b-border bg-card shrink-0 max-xl:py-3.5 max-xl:px-4 max-xl:gap-3 max-lg:sticky max-lg:top-0 max-lg:z-20 max-lg:flex-wrap max-lg:py-3 max-lg:px-4 max-lg:gap-3 max-sm:px-3 flex-wrap">
        <div className="restaurant-lockup min-w-0 flex-1 flex items-center gap-5 max-xl:gap-3 max-lg:w-full max-lg:justify-between [&_>_.brand]:shrink-0 grow shrink-0 basis-auto">
          <a
            className="brand inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight max-lg:text-2xl"
            href="/"
          >
            TableCast<span className="text-accent ml-px text-4xl">·</span>
          </a>
          <div className="restaurant-name border-l border-l-border pl-4 text-xs leading-relaxed min-w-0 flex-1 max-xl:pl-3 max-xl:max-w-none max-lg:border-l-0 max-lg:max-w-none max-lg:flex max-lg:items-center max-lg:gap-2 max-lg:text-xs">
            <span className="line-clamp-2 overflow-hidden wrap-anywhere" title={data.storeName}>
              {data.storeName}
            </span>
            <strong className="block text-base font-semibold shrink-0 max-lg:text-sm">
              {data.tableName}
            </strong>
          </div>
        </div>
        <div className="header-actions shrink-0 flex items-center gap-2 max-xl:gap-1.5 max-lg:w-full max-lg:justify-between max-sm:gap-1.5 max-w-full flex-wrap [&>.language-switch]:min-w-max">
          <LanguageSwitch
            onChange={(next) => language.mutate(next)}
            disabled={language.isPending}
          />
          <Button
            variant="ghost"
            type="button"
            data-state={voiceActive ? "voice-active" : ""}
            className="min-h-14 rounded-lg py-3 px-4 inline-flex items-center justify-center gap-2.5 text-sm font-semibold leading-normal transition-colors duration-150 ease-in-out bg-secondary text-primary border border-border [&_svg]:shrink-0 [&[data-state=voice-active]]:bg-accent-soft [&[data-state=voice-active]]:border-accent/30 [&[data-state=voice-active]]:text-accent-foreground max-xl:px-2.5 max-xl:text-xs max-xl:gap-1.5 max-lg:flex-1 max-sm:text-xs max-sm:gap-1 max-sm:px-1.5 max-sm:[&_svg]:w-4"
            disabled={view.status === "stopping" || language.isPending}
            onClick={() => {
              if (voiceActive) void voice.stop({ existingSession: view.error === "active" });
              else void voice.start(locale);
            }}
          >
            {voiceActive ? (
              <MicOff size={20} aria-hidden="true" />
            ) : (
              <Mic size={20} aria-hidden="true" />
            )}
            {view.status === "stopping"
              ? t("kiosk_voice_stopping")
              : voiceActive
                ? t("kiosk_voice_stop")
                : view.status === "error"
                  ? t("kiosk_voice_retry")
                  : view.status === "paused"
                    ? t("kiosk_voice_resume")
                    : t("kiosk_voice_start")}
          </Button>
          <Button
            variant="ghost"
            type="button"
            className="min-h-14 rounded-lg py-3 px-4 inline-flex items-center justify-center gap-2.5 text-sm font-semibold leading-normal transition-colors duration-150 ease-in-out border border-border [&_svg]:shrink-0 max-xl:px-2.5 max-xl:text-xs max-xl:gap-1.5 max-lg:flex-1 max-sm:text-xs max-sm:gap-1 max-sm:px-1.5 max-sm:[&_svg]:w-4"
            onClick={() => call.mutate(false)}
            disabled={call.isPending || data.staffCalled}
          >
            <Bell size={20} aria-hidden="true" />
            {data.staffCalled ? t("kiosk_called_staff") : t("kiosk_call_staff")}
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-5 flex-1 min-h-0 2xl:grid-cols-5 max-lg:flex max-lg:flex-col">
        <VoicePanel
          view={view}
          lines={conversationLines(data.events)}
          onStart={() => {
            void voice.start(locale);
          }}
        />
        <aside className="col-span-2 min-w-0 min-h-0 flex flex-col border-l border-l-border bg-card max-lg:border-l-0 max-lg:border-t max-lg:border-t-border max-lg:min-h-160">
          {data.plan && (
            <div className="pt-5 px-5 pb-4 [&_h2]:text-xl [&_h2]:tracking-tight [&_h2]:mt-1 max-lg:px-6">
              <div className="mt-3 flex justify-between gap-2 text-xs border border-border py-1.5 px-2.5 rounded-sm">
                <span>{data.plan.rules.text[locale].displayName}</span>
                <small className="text-xs text-muted-foreground whitespace-nowrap">
                  {t("kiosk_last_order")}{" "}
                  {time(
                    data.plan.startedAt +
                      (data.plan.rules.durationMinutes -
                        data.plan.rules.lastOrderMinutesBeforeEnd) *
                        60_000,
                    locale,
                  )}
                </small>
              </div>
            </div>
          )}
          <Tabs.Root
            className="flex flex-col min-h-0 flex-1"
            value={section}
            onValueChange={(value) => {
              if (typeof value === "string") setSection(value);
            }}
          >
            <Tabs.List className="menu-tabs flex border-b border-b-border py-0 px-3.5 gap-0 [&_button]:flex-1 [&_button]:text-xs [&_button]:min-h-12 [&_button]:py-2 [&_button]:px-1.5 [&_button]:border-b-2 [&_button]:border-b-transparent [&_button]:text-muted-foreground [&_button]:flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1 [&_button[data-active]]:border-b-primary [&_button[data-active]]:text-primary [&_button[data-active]]:font-semibold max-lg:[&_button]:min-h-14 max-lg:[&_button]:text-xs">
              <Tabs.Tab value="menu">{t("kiosk_menu")}</Tabs.Tab>
              <Tabs.Tab value="cart">
                {t("kiosk_cart")}
                <span className="count rounded-2xl py-px px-1 text-xs bg-secondary">
                  {data.cart.lines.reduce((sum, line) => sum + line.quantity, 0)}
                </span>
              </Tabs.Tab>
              <Tabs.Tab value="orders">{t("kiosk_orders")}</Tabs.Tab>
              <Tabs.Tab value="bill">{t("kiosk_bill")}</Tabs.Tab>
            </Tabs.List>
            <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] max-lg:max-h-128">
              <Tabs.Panel value="menu">
                {catalog.data && (
                  <ProductMenu
                    catalog={catalog.data}
                    onChoose={(product) => {
                      updateCart.reset();
                      setChosen({
                        product,
                        configVersion: data.configVersion,
                        cartVersion: data.cart.version,
                      });
                    }}
                  />
                )}
                <ErrorNotice
                  error={catalog.error}
                  onRetry={() => {
                    void catalog.refetch();
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="cart">
                <CartLines
                  lines={data.cart.lines}
                  onEdit={edit}
                  onRemove={(line) =>
                    updateCart.mutate({
                      lines: currentLines().filter((item) => item.id !== line.id),
                      expectedVersion: data.cart.version,
                    })
                  }
                  disabled={updateCart.isPending}
                />
              </Tabs.Panel>
              <Tabs.Panel value="orders">
                {data.orders.length === 0 ? (
                  <div className="text-muted-foreground flex items-center flex-col text-center py-10 px-5 gap-2.5 [&_h3]:text-sm [&_h3]:font-medium [&_p]:text-xs [&_p]:leading-loose">
                    {t("common_empty")}
                  </div>
                ) : (
                  data.orders.map((order) => (
                    <article
                      className="order-card border border-border rounded-md m-3.5 overflow-hidden"
                      key={order.id}
                    >
                      <div className="flex justify-between items-center gap-2 py-3 px-3.5 border-b border-b-border bg-background text-xs [&_strong]:text-sm">
                        <time>{time(order.createdAt, locale)}</time>
                        <Badge variant="outline">{t(`order_${order.status}`)}</Badge>
                      </div>
                      <CartLines lines={order.snapshot.lines} />
                    </article>
                  ))
                )}
              </Tabs.Panel>
              <Tabs.Panel value="bill">
                <div className="bill-summary py-6 px-5 [&_dl_>_div]:flex [&_dl_>_div]:items-center [&_dl_>_div]:justify-between [&_dl_>_div]:py-2 [&_dl_>_div]:px-0 [&_dl_>_div]:gap-3 [&_dl_>_div]:text-sm [&_.bill-total]:border-t [&_.bill-total]:border-t-border [&_.bill-total]:pt-4 [&_.bill-total]:mt-2.5 [&_.bill-total_dd]:text-2xl [&_.bill-total_dd]:font-semibold [&_[data-slot=button][data-variant=default]]:mt-6 [&_[data-slot=button][data-variant=default]]:w-full">
                  <h3 className="mb-5">{t("kiosk_bill")}</h3>
                  <dl>
                    <div>
                      <dt className="text-muted-foreground">{t("admin_ordered")}</dt>
                      <dd>{money(data.bill.orderedTotal, locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("kiosk_plan_charge")}</dt>
                      <dd>{money(data.bill.planTotal, locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("kiosk_adjustment")}</dt>
                      <dd>{money(data.bill.adjustmentTotal, locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("kiosk_paid")}</dt>
                      <dd>{money(data.bill.paidTotal, locale)}</dd>
                    </div>
                    <div className="bill-total">
                      <dt className="text-muted-foreground">{t("kiosk_due")}</dt>
                      <dd>{money(data.bill.due, locale)}</dd>
                    </div>
                  </dl>
                  <p className="text-muted-foreground text-xs mt-2.5">
                    {t("kiosk_not_sent")}: {money(data.bill.cartTotal, locale)}
                  </p>
                  <Button
                    variant="default"
                    size="lg"
                    type="button"

                    onClick={() => call.mutate(true)}
                    disabled={call.isPending}
                  >
                    {t("kiosk_bill_request")}
                  </Button>
                </div>
              </Tabs.Panel>
            </div>
          </Tabs.Root>
          <ErrorNotice error={updateCart.error || prepare.error || call.error || language.error} />
          <div className="border-t border-t-border bg-card pt-3 px-4 pb-4 max-lg:px-6 max-lg:flex max-lg:gap-5 max-lg:items-center max-sm:gap-3.5">
            <Button
              variant="ghost"
              type="button"
              className="basket-total flex items-center w-full pt-0 px-0 pb-2.5 gap-2.5 text-left max-lg:flex-1 max-lg:p-0 h-auto min-h-12 whitespace-normal"
              onClick={() => setSection("cart")}
            >
              <ShoppingBag size={20} aria-hidden="true" />
              <span className="text-xs text-muted-foreground">
                {t("kiosk_cart")}
                <strong className="block text-lg tracking-tight text-foreground font-semibold">
                  {money(data.cart.total, locale)}
                </strong>
              </span>
              <small className="ml-auto text-muted-foreground text-xs max-sm:hidden">
                {t("common_price_note")}
              </small>
            </Button>
            <Button
              variant="default"
              size="lg"
              type="button"
              className="w-full justify-between max-lg:w-auto max-lg:min-w-52 max-sm:min-w-44 max-sm:text-xs"
              disabled={
                !data.cart.complete ||
                data.cart.lines.length === 0 ||
                prepare.isPending ||
                updateCart.isPending
              }
              onClick={() => prepare.mutate()}
            >
              {t("kiosk_review")}
              <ChevronRight size={20} aria-hidden="true" />
            </Button>
          </div>
        </aside>
      </div>
      {chosen && chosen.configVersion === data.configVersion && (
        <ProductDialog
          key={chosen.line?.id ?? chosen.product.id}
          product={chosen.product}
          initial={chosen.line}
          busy={updateCart.isPending}
          error={updateCart.error}
          onClose={() => {
            updateCart.reset();
            setChosen(undefined);
          }}
          onSave={(line) =>
            updateCart.mutate({
              lines: [...currentLines().filter((item) => item.id !== line.id), line],
              expectedVersion: chosen.cartVersion,
            })
          }
        />
      )}
      <Dialog
        open={!!snapshot}
        onOpenChange={(open) => {
          if (!open && !submit.isPending) setSnapshot(undefined);
        }}
      >
        <DialogContent className="[&_.cart-lines]:p-0">
          <DialogHeader>
            <DialogClose
              className="ml-auto"
              aria-label={t("common_close")}
              disabled={submit.isPending}
            >
              <X size={22} />
            </DialogClose>
          </DialogHeader>
          <DialogTitle>{t("kiosk_review_title")}</DialogTitle>
          <DialogDescription>{t("kiosk_review_note")}</DialogDescription>
          {snapshot && (
            <>
              <DialogScroll>
                <CartLines lines={snapshot.lines} />
                {snapshot.plan && (
                  <p>
                    {t("kiosk_plan")}: {snapshot.plan.name[locale]}
                  </p>
                )}
              </DialogScroll>
              <div className="flex justify-between items-baseline border-t border-t-border pt-4 mt-4 text-base">
                <span>{t("common_total")}</span>
                <strong className="text-3xl">{money(snapshot.total, locale)}</strong>
              </div>
              <p className="text-muted-foreground">{t("common_price_note")}</p>
            </>
          )}
          <ErrorNotice error={submit.error} />
          <DialogFooter>
            <DialogClose
              className="min-h-14 rounded-lg py-3 px-4 inline-flex items-center justify-center gap-2.5 text-sm font-semibold leading-normal transition-colors duration-150 ease-in-out border border-border bg-card [&:hover:not(:disabled)]:bg-secondary [&_svg]:shrink-0"
              disabled={submit.isPending}
            >
              {t("kiosk_edit")}
            </DialogClose>
            <Button
              variant="default"
              size="lg"
              type="button"

              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {t("kiosk_confirm")}
              <Check size={18} aria-hidden="true" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={ordered} onOpenChange={setOrdered}>
        <DialogContent className="items-center text-center py-10 px-7 gap-3 [&_[data-slot=button][data-variant=default]]:mt-4 [&_[data-slot=button][data-variant=default]]:min-w-44">
          <div className="flex items-center justify-center bg-secondary w-20 h-20 rounded-full mb-3.5 text-primary">
            <Check size={36} aria-hidden="true" />
          </div>
          <DialogTitle>{t("kiosk_ordered")}</DialogTitle>
          <DialogClose className="min-h-14 rounded-lg py-3 px-4 inline-flex items-center justify-center gap-2.5 text-sm font-semibold leading-normal transition-colors duration-150 ease-in-out bg-primary text-card [&:hover:not(:disabled)]:bg-primary [&_svg]:shrink-0">
            {t("common_close")}
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
