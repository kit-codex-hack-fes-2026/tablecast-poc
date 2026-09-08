import { Tabs } from "@base-ui/react/tabs";
import type {
  CartLine,
  Locale,
  PricedLine,
  Product,
  Snapshot,
  TableState,
  UiSection,
  UiSectionInput,
} from "@tablecast/api/schema";
import {
  catalogSchema,
  orderSchema,
  snapshotSchema,
  tableStateSchema,
} from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChevronRight, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { money, time, useI18n } from "../../i18n/locale";
import { api, ApiFailure, json } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { CartLines } from "./cart-lines";
import { ProductMenu } from "./menu";
import { Pairing } from "./pairing";
import { ProductPage } from "./product-dialog";
import { VoiceConnection, type VoiceView } from "./voice-connection";
import { conversationLines, VoicePanel } from "./voice-panel";

const tableKey = ["tablecast-table"];
// 遅い応答が新しい画面操作・カート状態を巻き戻さない。
export function latestTable(current: TableState | undefined | null, incoming: TableState) {
  return current?.id === incoming.id && current.cursor > incoming.cursor ? current : incoming;
}

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
        return latestTable(client.getQueryData<TableState | null>(tableKey), result);
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
  const [prepared, setSnapshot] = useState<Snapshot>();
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const [ordered, setOrdered] = useState(false);
  const receive = (updated: TableState) =>
    client.setQueryData<TableState>(tableKey, (current) => latestTable(current, updated));
  const screen = useMutation({
    scope: { id: `tablecast-ui-${data.id}` },
    mutationFn: (input: UiSectionInput) =>
      api("/api/table/ui", json("PATCH", input), tableStateSchema),
    onSuccess: receive,
    onError: refresh,
  });
  const section = screen.isPending ? screen.variables.section : data.uiSection;
  const selectedProductId = screen.isPending ? screen.variables.productId : data.selectedProductId;
  const setSection = (next: UiSection) => {
    setChosen(undefined);
    screen.mutate({ section: next, productId: null });
  };
  function choose(product: Product) {
    updateCart.reset();
    setChosen({ product, configVersion: data.configVersion, cartVersion: data.cart.version });
    screen.mutate({ section: "menu", productId: product.id });
  }
  const selectedProduct = catalog.data?.configuration.products.find(
    (item) => item.id === selectedProductId,
  );
  const selection = selectedProduct
    ? chosen?.product.id === selectedProduct.id && chosen.configVersion === data.configVersion
      ? chosen
      : {
          product: selectedProduct,
          line: data.cart.lines.find(
            (line) => line.productId === selectedProduct.id && line.missing.length > 0,
          ),
          configVersion: data.configVersion,
          cartVersion: data.cart.version,
        }
    : undefined;
  const speed = useMutation({
    scope: { id: `tablecast-speed-${data.id}` },
    mutationFn: (value: number) =>
      api("/api/table/voice/speed", json("PATCH", { speed: value }), tableStateSchema),
    onSuccess: receive,
    onError: refresh,
  });
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
  const snapshotId = snapshot?.id;
  useEffect(() => {
    if (snapshotId) confirmationHeading.current?.focus();
  }, [snapshotId]);
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
      receive(updated);
      setChosen(undefined);
      screen.mutate({ section: "cart", productId: null });
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
      client.setQueryData<TableState>(tableKey, (current) =>
        current ? { ...current, snapshot: confirmation } : current,
      );
      setSection("cart");
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
    onSuccess: receive,
  });
  const language = useMutation({
    mutationFn: async (next: Locale) => {
      await voice.stop({ existingSession: view.error === "active" });
      return api("/api/table/locale", json("PATCH", { locale: next }), tableStateSchema);
    },
    onSuccess: (updated) => {
      receive(updated);
      setLocale(updated.locale);
    },
    onError: refresh,
  });
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
      screen.mutate({ section: "menu", productId: product.id });
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
    <div className="kiosk-shell h-dvh flex flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/80 bg-white/75 shadow-sm shadow-black/5 backdrop-blur-xl px-4 py-2">
        <a className="text-xl font-bold tracking-tight" href="/">
          TableCast<span className="text-accent">·</span>
        </a>
        <div className="mr-auto flex min-w-0 items-center gap-2 text-xs">
          <span className="max-w-48 truncate">{data.storeName}</span>
          <strong>{data.tableName}</strong>
        </div>
        <LanguageSwitch onChange={(next) => language.mutate(next)} disabled={language.isPending} />
        <Button
          variant="outline"
          onClick={() => call.mutate(false)}
          disabled={call.isPending || data.staffCalled}
        >
          <Bell />
          {data.staffCalled ? t("kiosk_called_staff") : t("kiosk_call_staff")}
        </Button>
      </header>
      <div className="grid grid-cols-2 flex-1 min-h-0 max-sm:grid-cols-1 max-sm:grid-rows-2">
        <VoicePanel
          view={view}
          lines={conversationLines(data.events)}
          events={data.events}
          catalog={catalog.data}
          snapshot={data.snapshot}
          onReview={() => prepare.mutate()}
          reviewPending={prepare.isPending}
          onChoose={choose}
          onStart={() => {
            if (voiceActive) void voice.stop({ existingSession: view.error === "active" });
            else void voice.start(locale);
          }}
          controlDisabled={view.status === "stopping" || language.isPending}
          speechSpeed={speed.isPending ? speed.variables : data.speechSpeed}
          onSpeedChange={(value) => speed.mutate(value)}
        />
        <aside className="min-w-0 min-h-0 flex flex-col border-l border-border bg-card max-sm:border-l-0 max-sm:border-t">
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
          <ErrorNotice error={screen.error} />
          <Tabs.Root
            className="flex flex-col min-h-0 flex-1"
            value={section}
            onValueChange={(value) => {
              if (value === "menu" || value === "cart" || value === "orders" || value === "bill")
                setSection(value);
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
            <div
              key={`${section}:${selectedProductId ?? ""}`}
              className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin]"
            >
              <Tabs.Panel value="menu">
                {selection ? (
                  <ProductPage
                    key={selection.line?.id ?? selection.product.id}
                    product={selection.product}
                    initial={selection.line}
                    busy={updateCart.isPending}
                    error={updateCart.error}
                    onClose={() => setSection("menu")}
                    onSave={(line) =>
                      updateCart.mutate({
                        lines: [...currentLines().filter((item) => item.id !== line.id), line],
                        expectedVersion: selection.cartVersion,
                      })
                    }
                  />
                ) : (
                  catalog.data && <ProductMenu catalog={catalog.data} onChoose={choose} />
                )}
                <ErrorNotice
                  error={catalog.error}
                  onRetry={() => {
                    void catalog.refetch();
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="cart">
                {ordered && (
                  <output className="m-3 flex items-center gap-3 rounded-xl border border-primary bg-secondary p-3">
                    <Check />
                    <strong className="flex-1">{t("kiosk_ordered")}</strong>
                    <Button variant="ghost" onClick={() => setOrdered(false)}>
                      {t("common_close")}
                    </Button>
                  </output>
                )}
                {snapshot ? (
                  <section className="p-4" aria-label={t("kiosk_review_title")}>
                    <h2
                      ref={confirmationHeading}
                      tabIndex={-1}
                      className="text-lg font-semibold outline-none"
                    >
                      {t("kiosk_review_title")}
                    </h2>
                    <p className="mt-2 text-sm">{t("kiosk_review_note")}</p>
                    <CartLines
                      lines={snapshot.lines}
                      products={catalog.data?.configuration.products}
                    />
                    {snapshot.plan && (
                      <p>
                        {t("kiosk_plan")}: {snapshot.plan.name[locale]}
                      </p>
                    )}
                    <div className="my-3 flex justify-between text-lg font-semibold">
                      <span>{t("common_total")}</span>
                      <strong>{money(snapshot.total, locale)}</strong>
                    </div>
                    <ErrorNotice error={submit.error} />
                    <div className="sticky bottom-0 grid grid-cols-3 gap-2 bg-card py-3">
                      <Button
                        variant="outline"
                        className="min-w-0 h-auto min-h-12 whitespace-normal py-2"
                        disabled={submit.isPending}
                        onClick={() => setSnapshot(undefined)}
                      >
                        {t("kiosk_edit")}
                      </Button>
                      <Button
                        className="col-span-2 min-w-0 h-auto min-h-12 whitespace-normal py-2"
                        disabled={submit.isPending}
                        onClick={() => submit.mutate()}
                      >
                        {t("kiosk_confirm")}
                        <Check />
                      </Button>
                    </div>
                  </section>
                ) : (
                  <>
                    <CartLines
                      lines={data.cart.lines}
                      products={catalog.data?.configuration.products}
                      onQuantity={(line, quantity) =>
                        updateCart.mutate({
                          lines: currentLines().map((item) =>
                            item.id === line.id ? { ...item, quantity } : item,
                          ),
                          expectedVersion: data.cart.version,
                        })
                      }
                      onEdit={edit}
                      onRemove={(line) =>
                        updateCart.mutate({
                          lines: currentLines().filter((item) => item.id !== line.id),
                          expectedVersion: data.cart.version,
                        })
                      }
                      disabled={updateCart.isPending}
                    />
                  </>
                )}
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
                      <CartLines
                        lines={order.snapshot.lines}
                        products={catalog.data?.configuration.products}
                      />
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
          <ErrorNotice
            error={updateCart.error || prepare.error || call.error || language.error || speed.error}
          />
          <div className="border-t border-t-border bg-card px-3 py-2 grid grid-cols-5 gap-2 items-center max-lg:grid-cols-1">
            <Button
              variant="ghost"
              type="button"
              className="basket-total col-span-2 max-lg:col-span-1 flex min-w-0 items-center gap-2 p-0 text-left h-auto min-h-11 whitespace-normal"
              onClick={() => setSection("cart")}
            >
              <ShoppingBag size={20} aria-hidden="true" />
              <span className="text-xs text-muted-foreground">
                {t("kiosk_cart")}
                <strong className="block text-lg tracking-tight text-foreground font-semibold">
                  {money(data.cart.total, locale)}
                </strong>
              </span>
            </Button>
            <Button
              variant="default"
              size="lg"
              type="button"
              className="col-span-3 max-lg:col-span-1 min-w-0 justify-between h-11 px-3 whitespace-normal"
              disabled={
                !!snapshot ||
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
    </div>
  );
}
