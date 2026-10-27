import { Dialog as PaneDialog } from "@base-ui/react/dialog";
import { Toast } from "@base-ui/react/toast";
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
import { Bell, Check, ChevronRight, ReceiptText, ShoppingBag, Utensils } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePanelRef } from "react-resizable-panels";
import { ActionToasts } from "../../components/action-toasts";
import { Brand } from "../../components/brand";
import { CartLines } from "../../components/cart-lines";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { LoadingState } from "../../components/loading-state";
import { Money } from "../../components/money";
import { ProductImage } from "../../components/product-image";
import { ProductMenu } from "../../components/product-menu";
import { StoreTheme } from "../../components/store-theme";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../components/ui/resizable";
import * as Tabs from "../../components/ui/tabs";
import { CurrencyContext } from "../../i18n/currency-context";
import { time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, type TableEndpoint } from "../../lib/api";
import { useMediaQuery } from "../../lib/use-media-query";
import { usePanelLayout } from "../../lib/use-panel-layout";
import { useRealtime } from "../../lib/use-realtime";
import { type CartFlight, CartFlightImage } from "./cart-flight";
import { conversationLines } from "./conversation-model";
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
type TableSessionProps = {
  data: TableState;
  endpoint: TableEndpoint;
  refresh: () => void;
};

export function TableSession(props: TableSessionProps) {
  return (
    <Toast.Provider timeout={4000} limit={1}>
      <TableSessionContent {...props} />
    </Toast.Provider>
  );
}

function TableSessionContent({ data, refresh, endpoint }: TableSessionProps) {
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
  const currencyControls = useContext(CurrencyContext);
  const tableKey = useMemo(() => tableQueryKey(endpoint), [endpoint]);
  const { locale, setLocale, t } = useI18n();
  const client = useQueryClient();
  const catalog = useQuery(tableCatalogOptions(data.storeId, data.configVersion, endpoint));
  const [voice] = useState(
    () => new VoiceConnection(() => {}, refresh, endpoint.client, currencyControls),
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
  const toasts = Toast.useToastManager();
  const [flights, setFlights] = useState<CartFlight[]>([]);
  const reducedMotion = useReducedMotion();
  const orderPane = useRef<HTMLElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const billingSummary = useRef<HTMLElement>(null);
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
  useEffect(() => {
    if (section === "bill") billingSummary.current?.scrollIntoView({ block: "start" });
  }, [section]);
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
    if (snapshotId) confirmationHeading.current?.focus({ preventScroll: true });
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
    mutationFn: ({
      lines,
      expectedVersion,
    }: {
      addition?: { from: DOMRect; imageKey: string };
      expectedVersion: number;
      lines: CartLine[];
      message?: string;
    }) => parseResponse(endpoint.client.cart.$put({ json: { expectedVersion, lines } })),
    onSuccess: (updated, input) => {
      receive(updated);
      if (input.message) toasts.add({ title: input.message });
      const target = orderPane.current?.querySelector('[data-ui="cart-icon"]');
      if (input.addition && target && !reducedMotion)
        setFlights([
          {
            ...input.addition,
            destination: "cart",
            to: target.getBoundingClientRect(),
            id: crypto.randomUUID(),
          },
        ]);
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
      detailTrigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    mutationFn: ({ confirmation }: { confirmation: Snapshot; pointer: boolean }) => {
      return parseResponse(
        endpoint.client.orders.$post({
          json: { snapshotId: confirmation.id, idempotencyKey: submitKey, approved: true },
        }),
      );
    },
    onMutate: ({ pointer }) => {
      const target = orderPane.current?.querySelector('[data-ui="orders-icon"]');
      if (!pointer || reducedMotion || !target) return [];
      const to = target.getBoundingClientRect();
      return Array.from(
        orderPane.current?.querySelectorAll<HTMLElement>('[data-ui="cart-preview"] > span') ?? [],
      ).flatMap((frame, index) => {
        const imageKey = frame.dataset.imageKey;
        return imageKey
          ? [
              {
                destination: "orders" as const,
                from: frame.getBoundingClientRect(),
                to,
                imageKey,
                id: crypto.randomUUID(),
                delay: index * 0.035,
              },
            ]
          : [];
      });
    },
    onSuccess: (_result, _input, images) => {
      setFlights(images ?? []);
      setSnapshot(undefined);
      toasts.add({ title: t("kiosk_ordered") });
      void client.invalidateQueries({ queryKey: tableKey });
      refresh();
    },
    onError: refresh,
  });
  const call = useMutation({
    mutationFn: (bill: boolean) =>
      parseResponse(bill ? endpoint.client.bill.request.$post() : endpoint.client.call.$post()),
    onSuccess: (updated, bill) => {
      receive(updated);
      toasts.add({ title: t(bill ? "kiosk_bill_requested" : "kiosk_called_staff") });
    },
  });
  const language = useMutation({
    mutationFn: async (next: Locale) => {
      await voice.stop({ existingSession: view.error === "active" });
      return parseResponse(endpoint.client.locale.$patch({ json: { locale: next } }));
    },
    onSuccess: (updated) => {
      receive(updated);
      setLocale(updated.locale);
      toasts.add({ title: t("kiosk_language_changed") });
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
      detailTrigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
        <KioskPaneHeader
          title={snapshot ? t("kiosk_review_title") : t("kiosk_cart")}
          amount={snapshot?.total ?? data.cart.total}
          label={t("kiosk_cart_total")}
          headingRef={snapshot ? confirmationHeading : undefined}
        />
        {snapshot ? (
          <section
            className="p-4 motion-safe:animate-tablecast-state"
            aria-label={t("kiosk_review_title")}
          >
            <p className="mt-2 text-sm">{t("kiosk_review_note")}</p>
            <CartLines lines={snapshot.lines} products={catalog.data?.configuration.products} />
            {snapshot.plan && (
              <p>
                {t("kiosk_plan")}: {snapshot.plan.name[locale]}
              </p>
            )}
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
        {catalog.data ? (
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
  function renderOrderActions() {
    const reviewing = snapshot && section === "cart";
    return (
      <div className="min-w-0 space-y-2">
        <ErrorNotice error={submit.error} />
        {reviewing ? (
          <div className="grid w-full grid-cols-3 gap-2">
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
              onClick={(event) =>
                submit.mutate({ confirmation: snapshot, pointer: event.detail > 0 })
              }
            >
              {t("kiosk_confirm")}
              <Check />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
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
      </div>
    );
  }
  function renderCheckout() {
    if (section !== "cart" && (section !== "menu" || !data.cart.lines.length)) return null;
    return (
      <div
        role="group"
        aria-label={t("kiosk_cart")}
        data-ui="order-actions"
        data-theme-part="checkout"
        className="border-t border-border bg-card p-3"
      >
        {renderOrderActions()}
      </div>
    );
  }
  function renderHeader() {
    const { storeName, branding } = catalog.data?.configuration ?? {};
    const banner = branding?.banner;
    return (
      <header
        data-theme-part="header"
        className="grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b border-border bg-card px-4 max-[80rem]:h-28 max-[80rem]:grid-cols-[minmax(0,1fr)_auto] max-[80rem]:grid-rows-2 max-[80rem]:gap-y-0 max-[80rem]:px-3 max-sm:h-48 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:grid-rows-4"
      >
        <div
          data-ui="header-branding"
          className="flex min-w-0 items-center gap-3 max-[80rem]:col-start-1 max-[80rem]:row-start-1 max-sm:col-span-2 max-sm:row-start-3 max-sm:gap-2"
        >
          <a className="inline-flex shrink-0 items-center" href={data.kind === "demo" ? "#" : "/"}>
            <Brand className="w-28 max-sm:w-18" />
          </a>
          <span
            aria-hidden
            data-ui="header-divider"
            className="h-8 shrink-0 border-l border-border"
          />
          <div data-ui="store-logo-banner" className="flex min-w-0 flex-nowrap items-center gap-2">
            {banner && (
              <img
                src={`/media/${banner.imageKey}?width=480`}
                alt={banner.alt[locale]}
                className="h-10 w-auto max-w-40 shrink-0 object-contain object-left max-xl:h-8 max-xl:max-w-28 max-sm:h-6 max-sm:max-w-14"
              />
            )}
            <div className="flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap text-sm max-xl:text-xs">
              <span className="min-w-0 truncate font-medium">{storeName ?? data.storeName}</span>
              <strong className="shrink-0 text-muted-foreground">
                {data.kind === "demo" ? t("demo_title") : data.tableName}
              </strong>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 max-[80rem]:col-start-1 max-[80rem]:row-start-2 max-[80rem]:justify-start max-sm:col-span-1 max-sm:row-span-2 max-sm:row-start-1 max-sm:self-start max-sm:pt-1 max-sm:justify-start">
          {renderVisitTools()}
        </div>
        <div className="flex w-full min-w-0 items-center justify-end gap-2 max-[80rem]:col-start-2 max-[80rem]:row-start-2 max-sm:col-start-1 max-sm:col-span-2 max-sm:row-start-4">
          <LanguageSwitch
            withIcon
            onChange={(next) => language.mutate(next)}
            disabled={language.isPending}
          />
          <CurrencySelector compact />
        </div>
        <Button
          variant="outline"
          size="lg"
          data-ui="call-staff"
          className="h-11 min-h-11 shrink-0 whitespace-nowrap px-3 py-2 text-sm max-[80rem]:col-start-2 max-[80rem]:row-start-1 max-[80rem]:justify-self-end"
          onClick={() => call.mutate(false)}
          disabled={call.isPending || data.staffCalled}
        >
          <Bell />
          <span>{data.staffCalled ? t("kiosk_called_staff") : t("kiosk_call_staff")}</span>
        </Button>
      </header>
    );
  }
  function renderVisitTools() {
    return (
      <div className="flex min-w-0 items-center gap-1 max-sm:flex-wrap">
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
        <KioskPaneHeader
          title={t("kiosk_orders_bill")}
          amount={data.bill.orderedTotal}
          label={t("kiosk_ordered_total")}
        />
        <h3 className="px-4 pt-4 text-base font-semibold">{t("kiosk_orders")}</h3>
        {data.orders.length === 0 ? (
          <div className="text-muted-foreground flex items-center flex-col text-center py-10 px-5 gap-2.5 [&_h3]:text-sm [&_h3]:font-medium [&_p]:text-xs [&_p]:leading-loose">
            {t("common_empty")}
          </div>
        ) : (
          data.orders.map((order) => (
            <article
              data-ui="order-card"
              className="m-3 overflow-hidden rounded-2xl border border-border bg-card"
              key={order.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-3 text-sm">
                <time>{time(order.createdAt, locale)}</time>
                <Badge variant="outline">{t(`order_${order.status}`)}</Badge>
                <span className="ml-auto font-semibold">
                  {t("common_total")}: <Money value={order.total} />
                </span>
              </div>
              <CartLines
                variant="receipt"
                lines={order.snapshot.lines}
                products={catalog.data?.configuration.products}
              />
              {data.kind === "table" && (
                <CustomerOrderAttribution endpoint={endpoint} order={order} />
              )}
            </article>
          ))
        )}
        {renderBilling()}
      </Tabs.Panel>
    );
  }
  function renderBilling() {
    return (
      <section
        ref={billingSummary}
        aria-label={t("kiosk_bill")}
        className="mx-3 mb-3 rounded-2xl border border-border bg-card"
      >
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
      </section>
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
                  ref={orderPane}
                  data-theme-part="menu"
                  className="@container/tablecast-order relative isolate overflow-hidden h-full min-w-0 min-h-0 flex flex-col bg-card"
                >
                  {renderPlanSummary()}
                  <ErrorNotice error={screen.error} />
                  <Tabs.Root
                    className="flex flex-col min-h-0 flex-1"
                    value={section === "bill" ? "orders" : section}
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
                    <div
                      inert={Boolean(selection)}
                      className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
                    >
                      {renderMenu()}
                      {renderCart()}
                      {renderOrders()}
                    </div>
                    <div inert={Boolean(selection)} className="sticky bottom-0 shrink-0 bg-card">
                      <KioskMenuTabs
                        data={data}
                        products={catalog.data?.configuration.products}
                        cartActions={renderCheckout()}
                      />
                    </div>
                  </Tabs.Root>
                  <PaneDialog.Root
                    open={Boolean(selection)}
                    modal={false}
                    disablePointerDismissal
                    onOpenChange={(open) => {
                      if (!open && !updateCart.isPending) setSection("menu");
                    }}
                  >
                    <PaneDialog.Portal container={orderPane}>
                      <PaneDialog.Backdrop
                        data-ui="product-overlay"
                        className="absolute inset-0 z-20 bg-overlay"
                      />
                      <PaneDialog.Popup
                        aria-label={selection?.product.text[locale].displayName}
                        initialFocus={false}
                        finalFocus={() =>
                          detailTrigger.current?.isConnected
                            ? detailTrigger.current
                            : (orderPane.current?.querySelector<HTMLElement>(
                                '[data-ui="cart-tab"]',
                              ) ?? false)
                        }
                        data-theme-part="dialog"
                        className="absolute inset-2 z-30 flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xl sm:inset-3"
                      >
                        {selection && (
                          <ProductPage
                            key={selection.line?.id ?? selection.product.id}
                            product={selection.product}
                            initial={selection.line}
                            busy={updateCart.isPending}
                            error={updateCart.error}
                            onClose={() => setSection("menu")}
                            onSave={(line, pointer, origin) => {
                              const image = orderPane.current?.querySelector(
                                '[data-ui="product-detail"] img',
                              );
                              const imageBounds = image?.getBoundingClientRect();
                              const paneBounds = orderPane.current?.getBoundingClientRect();
                              // 詳細をスクロールして写真が見えないときは、押した追加ボタンから運ぶ。
                              const from =
                                imageBounds &&
                                paneBounds &&
                                imageBounds.top >= paneBounds.top &&
                                imageBounds.bottom <= paneBounds.bottom
                                  ? imageBounds
                                  : origin;
                              updateCart.mutate({
                                lines: [
                                  ...currentLines().filter((item) => item.id !== line.id),
                                  line,
                                ],
                                expectedVersion: selection.cartVersion,
                                message: t(
                                  selection.line ? "kiosk_cart_updated" : "kiosk_cart_added",
                                ),
                                addition:
                                  pointer && !selection.line && selection.product.imageKey
                                    ? {
                                        imageKey: selection.product.imageKey,
                                        from,
                                      }
                                    : undefined,
                              });
                            }}
                          />
                        )}
                      </PaneDialog.Popup>
                    </PaneDialog.Portal>
                  </PaneDialog.Root>
                  {flights.map((flight) => (
                    <CartFlightImage
                      key={flight.id}
                      flight={flight}
                      onComplete={() =>
                        setFlights((current) => current.filter((item) => item.id !== flight.id))
                      }
                    />
                  ))}
                  <ActionToasts />
                  <ErrorNotice
                    error={
                      updateCart.error ||
                      prepare.error ||
                      call.error ||
                      language.error ||
                      speed.error
                    }
                  />
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
function KioskMenuTabs({
  data,
  products = [],
  cartActions,
}: {
  cartActions: ReactNode;
  data: TableState;
  products?: Product[];
}) {
  const hydrated = useHydrated();
  const { t } = useI18n();
  function imagesFor(lines: { productId: string }[]) {
    return [
      ...new Set(
        lines
          .map((line) => products.find((product) => product.id === line.productId)?.imageKey)
          .filter((key): key is string => Boolean(key)),
      ),
    ].slice(0, 3);
  }
  const images = imagesFor(data.cart.lines);
  const orderedImages = imagesFor(
    data.orders.toReversed().flatMap((order) => order.snapshot.lines),
  );
  const quantity = data.cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const orderedQuantity = data.orders
    .flatMap((order) => order.snapshot.lines)
    .reduce((sum, line) => sum + line.quantity, 0);
  const priceClass = "block whitespace-nowrap text-sm tabular-nums [&_[aria-label]]:text-inherit";
  const tabClass =
    "h-14 min-h-14 min-w-0 flex-col gap-0 px-1 py-0 text-sm leading-tight whitespace-nowrap text-center [&_svg]:size-4";
  return (
    <div className="relative">
      {cartActions}
      <Tabs.List
        data-ui="menu-tabs"
        className="grid w-full grid-cols-3 gap-1 rounded-none border-t border-border px-2 pt-1 pb-3 overflow-x-auto @max-[32rem]/tablecast-order:grid-cols-[max-content_minmax(max-content,1fr)_minmax(max-content,1fr)] @max-[32rem]/tablecast-order:px-1"
      >
        <Tabs.Tab
          className={tabClass}
          size="guest"
          data-theme-part="menu-tab"
          disabled={!hydrated}
          value="menu"
        >
          <span className="flex h-full flex-col items-center justify-center gap-0.5">
            <Utensils aria-hidden />
            <span>{t("kiosk_menu")}</span>
          </span>
        </Tabs.Tab>
        <Tabs.Tab
          className={tabClass}
          size="guest"
          data-theme-part="menu-tab"
          data-ui="cart-tab"
          disabled={!hydrated}
          value="cart"
        >
          <span className="flex h-8 max-w-full items-center justify-center gap-1">
            <ShoppingBag aria-hidden data-ui="cart-icon" className="shrink-0" />
            <span className="min-w-0 whitespace-nowrap leading-none">{t("kiosk_cart")}</span>
            <span
              data-ui="cart-count"
              className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-control px-1 text-foreground tabular-nums"
            >
              {quantity}
            </span>
            <TabProductImages images={images} kind="cart" />
          </span>
          <span data-ui="tab-price" className={priceClass}>
            <Money value={data.cart.total} />
          </span>
        </Tabs.Tab>
        <Tabs.Tab
          className={tabClass}
          size="guest"
          data-theme-part="menu-tab"
          disabled={!hydrated}
          value="orders"
        >
          <span className="flex h-8 max-w-full items-center justify-center gap-1">
            <ReceiptText aria-hidden data-ui="orders-icon" className="shrink-0" />
            <span className="min-w-0 whitespace-nowrap leading-none">{t("kiosk_orders_bill")}</span>
            <span
              data-ui="orders-count"
              className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-control px-1 text-foreground tabular-nums"
            >
              {orderedQuantity}
            </span>
            <TabProductImages images={orderedImages} kind="orders" />
          </span>
          <span data-ui="tab-price" className={priceClass}>
            <Money value={data.bill.orderedTotal} />
          </span>
        </Tabs.Tab>
      </Tabs.List>
    </div>
  );
}

function TabProductImages({ images, kind }: { images: string[]; kind: "cart" | "orders" }) {
  if (!images.length) return null;
  return (
    <span
      aria-hidden
      data-ui={`${kind}-preview`}
      className="ml-2 flex shrink-0 -space-x-3 @max-[32rem]/tablecast-order:-space-x-4.5"
    >
      {images.map((imageKey) => (
        <span
          key={imageKey}
          data-image-key={imageKey}
          className="inline-flex size-8 shrink-0 overflow-hidden rounded-lg border border-card bg-card shadow-sm"
        >
          <ProductImage
            src={`/media/${imageKey}`}
            width={32}
            height={32}
            sizes="32px"
            alt=""
            className="size-full object-contain"
          />
        </span>
      ))}
    </span>
  );
}

function KioskPaneHeader({
  title,
  label,
  amount,
  children,
  headingRef,
}: {
  amount: number;
  children?: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  label: string;
  title: string;
}) {
  return (
    <header
      data-ui="pane-heading"
      className="sticky top-0 z-10 space-y-3 border-b border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="text-lg font-semibold outline-none"
        >
          {title}
        </h2>
        <div className="ml-auto text-right">
          <span className="block text-sm text-muted-foreground">{label}</span>
          <strong className="block text-base">
            <Money value={amount} />
          </strong>
        </div>
      </div>
      {children}
    </header>
  );
}
