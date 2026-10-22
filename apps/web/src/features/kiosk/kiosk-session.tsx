import {
  type CartLine,
  type Locale,
  type PricedLine,
  type Product,
  type Snapshot,
  type TableState,
  type UiSection,
  type UiSectionInput,
} from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import {
  Bell,
  Check,
  ChevronRight,
  ReceiptText,
  ShoppingBag,
  Utensils,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanelRef } from "react-resizable-panels";
import { Brand } from "../../components/brand";
import { CartLines } from "../../components/cart-lines";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { LoadingState } from "../../components/loading-state";
import { Money } from "../../components/money";
import { ProductMenu } from "../../components/product-menu";
import { StoreLogo } from "../../components/store-logo";
import { StoreTheme } from "../../components/store-theme";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../components/ui/resizable";
import * as Tabs from "../../components/ui/tabs";
import { time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, type TableEndpoint } from "../../lib/api";
import { useMediaQuery } from "../../lib/use-media-query";
import { usePanelLayout } from "../../lib/use-panel-layout";
import { useRealtime } from "../../lib/use-realtime";
import { conversationLines } from "./conversation-model";
import { useCurrencyControls } from "./currency-provider";
import { CurrencySelector } from "./currency-selector";
import { CustomerOrderAttribution } from "./customer-order-attribution";
import { CustomerVisitPanel } from "./customer-visit-panel";
import { KioskGames } from "./games";
import { KioskVoicePanel } from "./kiosk-voice-panel";
import { ProductPage } from "./product-dialog";
import { latestTable } from "./table-cache";
import { tableCatalogOptions, tableQueryKey } from "./table-query";
import { VoiceConnection } from "./voice-connection";
import { useVoiceControls } from "./voice-subscription";
export function TableSession({
  data,
  refresh,
  endpoint,
}: {
  data: TableState;
  endpoint: TableEndpoint;
  refresh: () => void;
}) {
  const horizontal = useMediaQuery("(min-width: 56rem)");
  const conversationPanel = usePanelRef();
  const orientation = useRef(horizontal);
  const { defaultLayout, onLayoutChanged } = usePanelLayout({
    id: horizontal ? "tablecast-kiosk-layout" : "tablecast-kiosk-vertical-layout",
    panelIds: ["tablecast-conversation", "tablecast-order"],
  });
  useEffect(() => {
    if (orientation.current === horizontal) return;
    orientation.current = horizontal;
    const savedSize = defaultLayout?.["tablecast-conversation"];
    conversationPanel.current?.resize(
      savedSize === undefined ? (horizontal ? "240px" : "360px") : `${savedSize}%`,
    );
  }, [conversationPanel, defaultLayout, horizontal]);
  const currencyControls = useCurrencyControls();
  const tableKey = useMemo(() => tableQueryKey(endpoint), [endpoint]);
  const { locale, setLocale, t } = useI18n();
  const client = useQueryClient();
  const catalog = useQuery(tableCatalogOptions(data.storeId, data.configVersion, endpoint));
  const [voice] = useState(
    () => new VoiceConnection(() => {}, refresh, endpoint.client, currencyControls?.controller),
  );
  const view = useVoiceControls(voice);
  useEffect(() => voice.observeMicrophones(), [voice]);
  const [chosen, setChosen] = useState<{
    cartVersion: number;
    configVersion: number;
    line?: CartLine;
    product: Product;
  }>();
  const [prepared, setSnapshot] = useState<Snapshot>();
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const [ordered, setOrdered] = useState(false);
  const receive = (updated: TableState) =>
    client.setQueryData<TableState>(tableKey, (current) => latestTable(current, updated));
  const screen = useMutation({
    scope: { id: `tablecast-ui-${data.id}` },
    mutationFn: (input: UiSectionInput) =>
      parseResponse(endpoint.client.ui.$patch({ json: input })),
    onSuccess: receive,
    onError: refresh,
  });
  const { mutate: changeScreen } = screen;
  const previousConfigVersion = useRef(data.configVersion);
  useEffect(() => {
    if (previousConfigVersion.current !== data.configVersion) {
      previousConfigVersion.current = data.configVersion;
      changeScreen({ section: "menu", productId: null });
    }
  }, [data.configVersion, changeScreen]);
  const section = screen.isPending ? screen.variables.section : data.uiSection;
  const selectedProductId = screen.isPending ? screen.variables.productId : data.selectedProductId;
  const setSection = (next: UiSection) => {
    setChosen(undefined);
    screen.mutate({ section: next, productId: null });
  };

  const selectedProduct = catalog.data?.configuration.products.find(
    (item) => item.id === selectedProductId,
  );
  function selectedItem() {
    return selectedProduct
      ? chosen?.product.id === selectedProduct.id && chosen.configVersion === data.configVersion
        ? chosen
        : {
            product: selectedProduct,
            line: data.cart.lines.find(
              (line) =>
                line.productId === selectedProduct.id &&
                (line.missing.length > 0 || !!line.conditionIssues?.length),
            ),
            configVersion: data.configVersion,
            cartVersion: data.cart.version,
          }
      : undefined;
  }
  const selection = selectedItem();
  const speed = useMutation({
    scope: { id: `tablecast-speed-${data.id}` },
    mutationFn: (value: number) =>
      parseResponse(endpoint.client.voice.speed.$patch({ json: { speed: value } })),
    onSuccess: receive,
    onError: refresh,
  });
  const [submitKey, setSubmitKey] = useState("");
  useRealtime("table", data.cursor, refresh, endpoint.client);
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
    voice.synchronise(data.voiceSessionId, data.voiceState === "active", data.speechSpeed);
  }, [data.voiceSessionId, data.voiceState, data.speechSpeed, voice]);
  const customerContextCursor =
    data.events.findLast((event) => event.kind === "customer.context-reset")?.cursor ?? 0;
  const previousCustomerContext = useRef(0);
  useEffect(() => {
    if (customerContextCursor > previousCustomerContext.current) {
      previousCustomerContext.current = customerContextCursor;
      voice.clearCustomerContext();
    }
  }, [customerContextCursor, voice]);
  const updateCart = useMutation({
    mutationFn: ({ lines, expectedVersion }: { expectedVersion: number; lines: CartLine[] }) =>
      parseResponse(endpoint.client.cart.$put({ json: { expectedVersion, lines } })),
    onSuccess: (updated) => {
      receive(updated);
      setChosen(undefined);
      screen.mutate({ section: "cart", productId: null });
      setSnapshot(undefined);
    },
    onError: refresh,
  });
  const resetCart = updateCart.reset;
  const choose = useCallback(
    (product: Product) => {
      resetCart();
      setChosen({ product, configVersion: data.configVersion, cartVersion: data.cart.version });
      changeScreen({ section: "menu", productId: product.id });
    },
    [resetCart, changeScreen, data.configVersion, data.cart.version],
  );
  const prepare = useMutation({
    mutationFn: () =>
      parseResponse(
        endpoint.client.confirm.$post({
          json: { expectedVersion: data.cart.version, channel: "gui" },
        }),
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
    mutationFn: (confirmation: Snapshot) => {
      return parseResponse(
        endpoint.client.orders.$post({
          json: { snapshotId: confirmation.id, idempotencyKey: submitKey, approved: true },
        }),
      );
    },
    onSuccess: () => {
      setSnapshot(undefined);
      setOrdered(true);
      void client.invalidateQueries({ queryKey: tableKey });
      refresh();
    },
    onError: refresh,
  });
  const call = useMutation({
    mutationFn: (bill: boolean) =>
      parseResponse(bill ? endpoint.client.bill.request.$post() : endpoint.client.call.$post()),
    onSuccess: receive,
  });
  const language = useMutation({
    mutationFn: async (next: Locale) => {
      await voice.stop({ existingSession: view.error === "active" });
      return parseResponse(endpoint.client.locale.$patch({ json: { locale: next } }));
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

  const toggleVoice = () => {
    if (voiceActive) void voice.stop({ existingSession: view.error === "active" });
    else void voice.start(locale, data.speechSpeed);
  };
  function renderCart() {
    return (
      <Tabs.Panel value="cart">
        {ordered && (
          <output className="m-3 flex items-center gap-3 rounded-xl border border-success-border bg-success-soft p-3 text-success motion-safe:animate-tablecast-state">
            <Check />
            <strong className="flex-1">{t("kiosk_ordered")}</strong>
            <Button variant="ghost" onClick={() => setOrdered(false)}>
              {t("common_close")}
            </Button>
          </output>
        )}
        {snapshot ? (
          <section
            className="p-4 motion-safe:animate-tablecast-state"
            aria-label={t("kiosk_review_title")}
          >
            <h2
              ref={confirmationHeading}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              {t("kiosk_review_title")}
            </h2>
            <p className="mt-2 text-sm">{t("kiosk_review_note")}</p>
            <CartLines lines={snapshot.lines} products={catalog.data?.configuration.products} />
            {snapshot.plan && (
              <p>
                {t("kiosk_plan")}: {snapshot.plan.name[locale]}
              </p>
            )}
            <div className="my-3 flex justify-between text-lg font-semibold">
              <span>{t("common_total")}</span>
              <strong>
                <Money value={snapshot.total} />
              </strong>
            </div>
          </section>
        ) : (
          <>
            <CartLines
              lines={data.cart.lines}
              products={
                catalog.data?.version === data.configVersion
                  ? catalog.data.configuration.products
                  : undefined
              }
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
    );
  }
  function renderMenu() {
    return (
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
        ) : catalog.data ? (
          <ProductMenu catalog={catalog.data} onChoose={choose} />
        ) : catalog.isPending ? (
          <div className="p-4">
            <LoadingState cards />
          </div>
        ) : null}
        <ErrorNotice query={catalog} />
      </Tabs.Panel>
    );
  }
  function renderCheckout() {
    const reviewing = snapshot && section === "cart";
    return (
      <footer data-theme-part="checkout" className="shrink-0 border-t border-border bg-card p-3">
        <ErrorNotice error={submit.error} />
        {reviewing ? (
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="h-auto min-h-14 min-w-0 whitespace-normal px-3 py-2"
              disabled={submit.isPending}
              onClick={() => setSnapshot(undefined)}
            >
              {t("kiosk_edit")}
            </Button>
            <Button
              className="col-span-2 h-auto min-h-14 min-w-0 whitespace-normal px-3 py-2"
              disabled={submit.isPending}
              onClick={() => submit.mutate(snapshot)}
            >
              {t("kiosk_confirm")}
              <Check />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              type="button"
              data-ui="basket-total"
              className="h-auto min-h-14 min-w-0 flex-1 justify-start gap-2 whitespace-normal px-1 py-2 text-left"
              onClick={() => setSection("cart")}
            >
              <ShoppingBag size={20} aria-hidden="true" />
              <span className="min-w-0 text-sm leading-normal text-muted-foreground">
                {t("kiosk_cart")}
                <strong className="block wrap-break-word text-lg font-semibold tracking-tight text-foreground">
                  <Money value={data.cart.total} />
                </strong>
              </span>
            </Button>
            <Button
              type="button"
              className="h-auto min-h-14 min-w-0 flex-1 justify-between whitespace-normal px-3 py-2"
              disabled={
                !snapshot &&
                (!data.cart.complete ||
                  data.cart.lines.length === 0 ||
                  prepare.isPending ||
                  updateCart.isPending)
              }
              onClick={() => (snapshot ? setSection("cart") : prepare.mutate())}
            >
              {t("kiosk_review")}
              <ChevronRight size={20} aria-hidden="true" />
            </Button>
          </div>
        )}
      </footer>
    );
  }
  function renderHeader() {
    const { storeName, branding } = catalog.data?.configuration ?? {};
    const logo = branding?.logo;
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
        <div className="max-[56rem]:justify-self-end">{renderVisitTools()}</div>
        <Button
          variant="outline"
          size="lg"
          className="h-auto whitespace-normal py-2 max-[56rem]:col-span-2 max-[56rem]:text-sm"
          onClick={() => call.mutate(false)}
          disabled={call.isPending || data.staffCalled}
        >
          <Bell />
          {data.staffCalled ? t("kiosk_called_staff") : t("kiosk_call_staff")}
        </Button>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-[56rem]:col-span-2 [&_[data-slot=button]]:h-auto [&_[data-slot=button]]:min-h-14">
          <LanguageSwitch
            onChange={(next) => language.mutate(next)}
            disabled={language.isPending}
          />
          <CurrencySelector />
        </div>
      </header>
    );
  }
  function renderVisitTools() {
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
          stopVoice={() => voice.stop()}
        />
      </div>
    );
  }
  function renderPlanSummary() {
    const plan = data.plan;
    if (!plan) return null;
    return (
      <div className="border-b border-border px-4 py-2">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>{plan.rules.text[locale].displayName}</span>
          <small className="text-xs text-muted-foreground whitespace-nowrap">
            {t("kiosk_last_order")}{" "}
            {time(
              plan.startedAt +
                (plan.rules.durationMinutes - plan.rules.lastOrderMinutesBeforeEnd) * 60_000,
              locale,
            )}
          </small>
        </div>
      </div>
    );
  }
  function renderOrders() {
    return (
      <Tabs.Panel value="orders">
        {data.orders.length === 0 ? (
          <div className="text-muted-foreground flex items-center flex-col text-center py-10 px-5 gap-2.5 [&_h3]:text-sm [&_h3]:font-medium [&_p]:text-xs [&_p]:leading-loose">
            {t("common_empty")}
          </div>
        ) : (
          data.orders.map((order) => (
            <article
              data-ui="order-card"
              className="border border-border rounded-md m-3.5 overflow-hidden"
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
              {data.kind === "table" && (
                <CustomerOrderAttribution endpoint={endpoint} order={order} />
              )}
            </article>
          ))
        )}
      </Tabs.Panel>
    );
  }
  function renderBilling() {
    return (
      <Tabs.Panel value="bill">
        <div
          data-ui="bill-summary"
          className="py-6 px-5 [&_dl_>_div]:flex [&_dl_>_div]:items-center [&_dl_>_div]:justify-between [&_dl_>_div]:py-2 [&_dl_>_div]:px-0 [&_dl_>_div]:gap-3 [&_dl_>_div]:text-sm [&_[data-ui=bill-total]]:border-t [&_[data-ui=bill-total]]:border-t-border [&_[data-ui=bill-total]]:pt-4 [&_[data-ui=bill-total]]:mt-2.5 [&_[data-ui=bill-total]_dd]:text-2xl [&_[data-ui=bill-total]_dd]:font-semibold [&_[data-slot=button][data-variant=default]]:mt-6 [&_[data-slot=button][data-variant=default]]:w-full"
        >
          <h3 className="mb-5">{t("kiosk_bill")}</h3>
          <dl>
            <div>
              <dt className="text-muted-foreground">{t("admin_ordered")}</dt>
              <dd>
                <Money value={data.bill.orderedTotal} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("kiosk_plan_charge")}</dt>
              <dd>
                <Money value={data.bill.planTotal} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("kiosk_adjustment")}</dt>
              <dd>
                <Money value={data.bill.adjustmentTotal} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("kiosk_paid")}</dt>
              <dd>
                <Money value={data.bill.paidTotal} />
              </dd>
            </div>
            <div data-ui="bill-total" className="">
              <dt className="text-muted-foreground">{t("kiosk_due")}</dt>
              <dd>
                <Money value={data.bill.due} />
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs mt-2.5">
            {t("kiosk_not_sent")}: <Money value={data.bill.cartTotal} />
          </p>
          {data.billRequested ? (
            <div
              role="status"
              className="mt-6 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-success"
            >
              <Check className="size-5 shrink-0" />
              <span>{t("kiosk_bill_requested")}</span>
            </div>
          ) : (
            <Button
              variant="default"
              size="lg"
              type="button"
              className="h-auto min-h-14 whitespace-normal py-2"
              onClick={() => call.mutate(true)}
              disabled={call.isPending}
            >
              {t("kiosk_bill_request")}
            </Button>
          )}
        </div>
      </Tabs.Panel>
    );
  }
  function renderSession() {
    return (
      <StoreTheme appearance={catalog.data?.configuration.appearance}>
        <div
          data-theme-part="screen"
          data-ui="kiosk-shell"
          className="h-dvh flex flex-col overflow-hidden"
        >
          {renderHeader()}
          <div data-ui="kiosk-content" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <ResizablePanelGroup
              orientation={horizontal ? "horizontal" : "vertical"}
              className="min-h-128 flex-1 max-sm:flex-col!"
              defaultLayout={defaultLayout}
              onLayoutChanged={onLayoutChanged}
            >
              <ResizablePanel
                id="tablecast-conversation"
                panelRef={conversationPanel}
                groupResizeBehavior="preserve-pixel-size"
                defaultSize={horizontal ? "240px" : "360px"}
                minSize={horizontal ? "224px" : "344px"}
                maxSize="70%"
                className="h-full"
              >
                <KioskVoicePanel
                  voice={voice}
                  lines={conversationLines(data.events)}
                  events={data.events}
                  catalog={catalog.data}
                  snapshot={data.snapshot}
                  onReview={
                    data.snapshot?.channel === "gui" || (snapshot && section === "cart")
                      ? undefined
                      : () => (snapshot ? setSection("cart") : prepare.mutate())
                  }
                  reviewPending={prepare.isPending}
                  onChoose={choose}
                  onStart={toggleVoice}
                  controlDisabled={view.status === "stopping" || language.isPending}
                  speechSpeed={speed.isPending ? speed.variables : data.speechSpeed}
                  onSpeedChange={(value) => speed.mutate(value)}
                  onMicrophoneChange={(deviceId) => {
                    void voice.selectMicrophone(deviceId);
                  }}
                  onMicrophoneRefresh={() => {
                    void voice.refreshMicrophones();
                  }}
                />
              </ResizablePanel>
              <ResizableHandle aria-label={t("kiosk_resize_panes")} />
              <ResizablePanel id="tablecast-order" minSize="30%" className="h-full">
                <aside
                  data-theme-part="menu"
                  className="isolate overflow-hidden h-full min-w-0 min-h-0 flex flex-col bg-card"
                >
                  {renderPlanSummary()}
                  <ErrorNotice error={screen.error} />
                  <Tabs.Root
                    className="flex flex-col min-h-0 flex-1"
                    value={section}
                    onValueChange={(value: unknown) => {
                      if (
                        value === "menu" ||
                        value === "cart" ||
                        value === "orders" ||
                        value === "bill"
                      )
                        setSection(value);
                    }}
                  >
                    <KioskMenuTabs data={data} />
                    <div
                      key={`${section}:${selectedProductId ?? ""}`}
                      className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
                    >
                      {renderMenu()}
                      {renderCart()}
                      {renderOrders()}
                      {renderBilling()}
                    </div>
                  </Tabs.Root>
                  <ErrorNotice
                    error={
                      updateCart.error ||
                      prepare.error ||
                      call.error ||
                      language.error ||
                      speed.error
                    }
                  />
                  {renderCheckout()}
                </aside>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </StoreTheme>
    );
  }
  return renderSession();
}
function KioskMenuTabs({ data }: { data: TableState }) {
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
