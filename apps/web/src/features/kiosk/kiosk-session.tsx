import { Toast } from "@base-ui/react/toast";
import { resolveLocalized, resolveText, uiLocale } from "@tablecast/api/localization";
import {
  type CartLine,
  type CoreState,
  type Locale,
  localeSchema,
  maxCartLines,
  type Product,
  type Snapshot,
  submittedCoreOrderSchema,
  type UiSection,
} from "@tablecast/api/schema";
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Check, LoaderCircle, Pencil, Send } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePanelRef } from "react-resizable-panels";
import {
  type ActionToastData,
  ActionToasts,
  actionToastTimeout,
} from "../../components/action-toasts";
import { Brand } from "../../components/brand";
import { CartLines } from "../../components/cart-lines";
import { ErrorNotice } from "../../components/error-notice";
import { ImageProvider } from "../../components/image-provider";
import { LanguageSwitch } from "../../components/language-switch";
import { LoadingState } from "../../components/loading-state";
import { Money } from "../../components/money";
import { StoreLogo } from "../../components/store-logo";
import { StoreTheme } from "../../components/store-theme";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
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
import { m } from "../../paraglide/messages.js";
import { pendingCartLines } from "./cart-change-model";
import { useCartUpdates } from "./cart-updates-query";
import { conversationLines } from "./conversation-model";
import { CurrencySelector } from "./currency-selector";
import { CustomerOrderAttribution } from "./customer-order-attribution";
import { customerParticipantsOptions, customerTargetKey } from "./customer-participants-query";
import { CustomerVisitPanel } from "./customer-visit-panel";
import { KioskGames } from "./games";
import { KioskMenuTabs } from "./kiosk-menu-tabs";
import { KioskVoicePanel } from "./kiosk-voice-panel";
import { KioskMenu } from "./menu-search";
import { useTablePresentation } from "./presentation-query";
import { ProductPage } from "./product-dialog";
import { StaffAssistance } from "./staff-assistance";
import { latestTable } from "./table-cache";
import {
  tableCatalogOptions,
  tableOrdersKey,
  tableQueryKey,
  useTableResources,
} from "./table-query";
import { VoiceConnection } from "./voice-connection";
import { useVoiceControls } from "./voice-subscription";
type TableSessionProps = {
  data: CoreState;
  endpoint: TableEndpoint;
  refresh: () => void;
};

function menuImageSizes(width?: number) {
  const menuColumns = width && width >= 768 ? 3 : width && width >= 512 ? 2 : 1;
  return width
    ? `${Math.floor((width - 32 - (menuColumns - 1) * 24) / menuColumns - 26)}px`
    : undefined;
}

export function TableSession(props: TableSessionProps) {
  return (
    <Toast.Provider timeout={actionToastTimeout} limit={1}>
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
  const languageKey = ["tablecast-language-update", endpoint.key, data.id];
  const pendingLocales = useMutationState({
    filters: { mutationKey: languageKey, status: "pending", exact: true },
    select: (mutation) => localeSchema.parse(mutation.state.variables),
  });
  const displayLocale = pendingLocales.at(-1) ?? data.locale;
  const client = useQueryClient();
  const { history, orders, events, eventQuery, recordOrder } = useTableResources(
    data,
    endpoint,
    refresh,
  );
  const catalog = useQuery(tableCatalogOptions(data.storeId, data.configVersion, endpoint));
  const [voice] = useState(
    () => new VoiceConnection(() => {}, refresh, endpoint.client, currencyControls),
  );
  const view = useVoiceControls(voice);
  useEffect(() => voice.observeMicrophones(), [voice]);
  const [chosen, setChosen] = useState<{
    configVersion: number;
    editing?: boolean;
    error?: unknown;
    failureId?: number;
    line?: CartLine;
    product: Product;
  }>();
  const [orderWidth, setOrderWidth] = useState<number>();
  const [prepared, setSnapshot] = useState<Snapshot>();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [menuCategory, setMenuCategory] = useState("all");
  const confirmationAction = useRef<HTMLButtonElement>(null);
  const toasts = Toast.useToastManager<ActionToastData>();
  const orderPane = useRef<HTMLElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const billingSummary = useRef<HTMLElement>(null);
  const receive = (updated: CoreState) =>
    client.setQueryData<CoreState>(tableKey, (current) => latestTable(current, updated));
  const updateCart = useCartUpdates({
    data,
    endpoint,
    onStart: (input) => {
      setChosen((current) =>
        current?.product.id === input.dismissProductId ? undefined : current,
      );
      setSnapshot(undefined);
    },
    onSuccess: ({ change }) => {
      if (change.type === "add" || change.type === "edit") {
        const product = catalog.data?.configuration.products.find(
          (item) => item.id === change.line.productId,
        );
        const name = product ? resolveText(product.text, locale).displayName : t("kiosk_cart");
        toasts.add({
          type: "success",
          data: { icon: "product" },
          title:
            change.type === "add"
              ? m.kiosk_cart_added_product(
                  { product: name, count: change.line.quantity },
                  { locale: uiLocale(locale) },
                )
              : m.kiosk_cart_updated_product({ product: name }, { locale: uiLocale(locale) }),
        });
      }
    },
    onError: (_error, input) => {
      const change = input.change;
      const line =
        "line" in change ? change.line : data.cart.lines.find((item) => item.id === change.id);
      const product = catalog.data?.configuration.products.find(
        (item) => item.id === line?.productId,
      );
      toasts.add({
        type: "error",
        data: { icon: "product" },
        title: m.kiosk_cart_failed_product(
          { product: product ? resolveText(product.text, locale).displayName : t("kiosk_cart") },
          { locale: uiLocale(locale) },
        ),
      });
    },
  });
  const cartPending = updateCart.pending.length > 0;
  const cartLines = pendingCartLines(
    data.cart.lines,
    updateCart.pending,
    catalog.data?.configuration.products ?? [],
  );
  const { screen, presentation, searchPending } = useTablePresentation({
    data,
    endpoint,
    refresh,
    dismissals: updateCart.pending,
  });
  const { mutate: changeScreen } = screen;
  const section = presentation.section;
  useEffect(() => {
    if (section === "bill") billingSummary.current?.scrollIntoView({ block: "start" });
  }, [section]);
  const selectedProductId = presentation.productId;
  const setSection = (next: UiSection) => {
    setChosen(undefined);
    if (next !== "cart") setCheckoutOpen(false);
    screen.mutate({ section: next, productId: null });
  };

  const selectedProduct = catalog.data?.configuration.products.find(
    (item) => item.id === selectedProductId,
  );
  function selectedItem() {
    if (!selectedProduct) return undefined;
    if (chosen?.product.id === selectedProduct.id && chosen.configVersion === data.configVersion)
      return chosen;
    const failure = updateCart.failures.findLast(
      (item) => item.input.dismissProductId === selectedProduct.id,
    );
    const failedChange = failure?.input.change;
    const recovery = failedChange && "line" in failedChange ? failedChange : undefined;
    const existing = data.cart.lines.find(
      (line) =>
        line.productId === selectedProduct.id &&
        (line.missing.length > 0 || !!line.conditionIssues?.length),
    );
    return {
      product: selectedProduct,
      line: recovery?.line ?? existing,
      configVersion: data.configVersion,
      editing: recovery ? recovery.type === "edit" : Boolean(existing),
      error: failure?.error,
      failureId: failure?.mutationId,
    };
  }
  const selection = selectedItem();
  const productOpen = Boolean(selection);
  const speed = useMutation({
    scope: { id: `tablecast-speed-${data.id}` },
    mutationFn: (value: number) =>
      parseResponse(
        endpoint.client.voice.speed.$patch({ json: { speed: value }, query: { view: "core" } }),
      ),
    onSuccess: receive,
    onError: refresh,
  });
  const [submitKey, setSubmitKey] = useState("");
  const snapshot =
    !cartPending &&
    prepared &&
    prepared.cartVersion === data.cart.version &&
    prepared.locale === data.locale &&
    data.snapshot?.id === prepared.id &&
    ["pending", "read"].includes(data.snapshot.status)
      ? prepared
      : undefined;
  const snapshotId = snapshot?.id;
  useEffect(() => {
    if (snapshotId && checkoutOpen) confirmationAction.current?.focus({ preventScroll: true });
  }, [snapshotId, checkoutOpen]);
  useEffect(() => {
    setLocale(displayLocale);
  }, [displayLocale, setLocale]);
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
    voice.synchronise(
      data.voiceSessionId,
      data.voiceState === "active",
      data.speechSpeed,
      data.locale,
    );
  }, [data.voiceSessionId, data.voiceState, data.speechSpeed, data.locale, voice]);
  const incomingCustomerContextCursor =
    events.findLast((event) => event.kind === "customer.context-reset")?.cursor ?? 0;
  const [lastCustomerContextCursor, setLastCustomerContextCursor] = useState(0);
  const customerContextCursor = Math.max(lastCustomerContextCursor, incomingCustomerContextCursor);
  if (customerContextCursor > lastCustomerContextCursor)
    setLastCustomerContextCursor(customerContextCursor);
  const participants = useQuery({
    ...customerParticipantsOptions(endpoint, data.id, customerContextCursor),
    enabled: false,
  });
  const selectingCustomer =
    useIsMutating({ mutationKey: customerTargetKey(endpoint, data.id) }) > 0;
  const customerTargetUnconfirmed =
    selectingCustomer || (customerContextCursor > 0 && !participants.isSuccess);
  const previousCustomerContext = useRef(0);
  useEffect(() => {
    if (customerContextCursor > previousCustomerContext.current) {
      previousCustomerContext.current = customerContextCursor;
      voice.clearCustomerContext();
      toasts.add({
        type: "success",
        data: { icon: "member" },
        title: t("customer_context_updated"),
      });
    }
  }, [customerContextCursor, voice, toasts, t]);
  const resetCart = updateCart.reset;
  const choose = useCallback(
    (product: Product) => {
      setCheckoutOpen(false);
      resetCart();
      detailTrigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setChosen({ product, configVersion: data.configVersion });
      changeScreen({ section: "menu", productId: product.id });
    },
    [resetCart, changeScreen, data.configVersion],
  );
  const prepare = useMutation({
    mutationFn: () =>
      parseResponse(
        endpoint.client.confirm.$post({
          json: { expectedVersion: data.cart.version, channel: "gui" },
        }),
      ),
    onSuccess: (confirmation) => {
      client.setQueryData<CoreState>(tableKey, (current) =>
        current ? { ...current, snapshot: confirmation } : current,
      );
      setSection("cart");
      setSnapshot(confirmation);
      setCheckoutOpen(true);
      setSubmitKey(crypto.randomUUID());
    },
    onError: () => {
      refresh();
      toasts.add({ type: "error", title: t("kiosk_review_failed") });
    },
  });
  const submit = useMutation({
    mutationFn: ({ confirmation }: { confirmation: Snapshot; pointer: boolean }) => {
      return parseResponse(
        endpoint.client.orders.$post({
          query: { view: "core" },
          json: { snapshotId: confirmation.id, idempotencyKey: submitKey, approved: true },
        }),
      );
    },
    onMutate: async () => {
      await client.cancelQueries({ queryKey: tableOrdersKey(endpoint, data.id) });
    },
    onSuccess: (result) => {
      const { order, state } = submittedCoreOrderSchema.parse(result);
      setCheckoutOpen(false);
      setSnapshot(undefined);
      toasts.add({
        type: "success",
        data: { icon: "order" },
        title: m.kiosk_ordered_items(
          { count: order.snapshot.lines.reduce((sum, line) => sum + line.quantity, 0) },
          { locale: uiLocale(locale) },
        ),
      });
      receive(state);
      recordOrder(order);
    },
    onError: (_error, input) => {
      refresh();
      toasts.add({
        type: "error",
        title: m.kiosk_order_failed_items(
          { count: input.confirmation.lines.reduce((sum, line) => sum + line.quantity, 0) },
          { locale: uiLocale(locale) },
        ),
      });
    },
  });
  const call = useMutation({
    mutationFn: (bill: boolean) =>
      parseResponse(
        bill
          ? endpoint.client.bill.request.$post({ query: { view: "core" } })
          : endpoint.client.call.$post({ query: { view: "core" }, json: {} }),
      ),
    onSuccess: (updated, bill) => {
      receive(updated);
      toasts.add({
        type: "success",
        data: { icon: "staff" },
        title: t(bill ? "kiosk_bill_requested" : "kiosk_called_staff"),
      });
    },
    onError: (_error, bill) =>
      toasts.add({
        type: "error",
        title: t(bill ? "kiosk_bill_request_failed" : "kiosk_staff_request_failed"),
      }),
  });
  const language = useMutation({
    mutationKey: languageKey,
    scope: { id: `tablecast-language-${endpoint.key}-${data.id}` },
    mutationFn: async (next: Locale) => {
      return parseResponse(
        endpoint.client.locale.$patch({ json: { locale: next }, query: { view: "core" } }),
      );
    },
    onSuccess: (updated) => {
      receive(updated);
      toasts.add({
        type: "success",
        data: { icon: "language" },
        title: t("kiosk_language_changed"),
      });
    },
    onError: refresh,
  });
  function edit(line: CartLine) {
    const product = catalog.data?.configuration.products.find((item) => item.id === line.productId);
    if (product) {
      setCheckoutOpen(false);
      detailTrigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      updateCart.reset();
      screen.mutate({ section: "menu", productId: product.id });
      setChosen({
        product,
        line,
        configVersion: data.configVersion,
      });
    }
  }
  const voiceActive = view.error === "active" || !["idle", "paused", "error"].includes(view.status);

  const toggleVoice = () => {
    if (!voiceActive && customerTargetUnconfirmed) return;
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
          pending={cartPending}
        />
        <ErrorNotice error={prepare.error || submit.error} />
        {snapshot ? (
          <section
            className="p-4 motion-safe:animate-tablecast-state"
            aria-label={t("kiosk_review_title")}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">{t("kiosk_review_note")}</p>
              <Button
                variant="outline"
                className="min-h-14"
                disabled={submit.isPending || cartPending}
                onClick={() => {
                  setSnapshot(undefined);
                  setCheckoutOpen(false);
                }}
              >
                <Pencil aria-hidden />
                {t("kiosk_edit")}
              </Button>
            </div>
            <CartLines lines={snapshot.lines} products={catalog.data?.configuration.products} />
            {snapshot.plan && (
              <p>
                {t("kiosk_plan")}: {resolveLocalized(snapshot.plan.name, locale)}
              </p>
            )}
          </section>
        ) : (
          <>
            <CartLines
              lines={cartLines}
              products={
                catalog.data?.version === data.configVersion
                  ? catalog.data.configuration.products
                  : undefined
              }
              onQuantity={(line, quantity) =>
                updateCart.mutate({
                  change: { type: "quantity", id: line.id, quantity },
                  configVersion: data.configVersion,
                })
              }
              onEdit={edit}
              onRemove={(line) =>
                updateCart.mutate({
                  change: { type: "remove", id: line.id },
                  configVersion: data.configVersion,
                })
              }
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
          <KioskMenu
            imageSizes={menuImageSizes(orderWidth)}
            catalog={catalog.data}
            category={menuCategory}
            onCategoryChange={setMenuCategory}
            onChoose={choose}
            search={presentation.search ?? null}
            result={data.menuSearch}
            active={section === "menu" && !selectedProductId}
            pending={searchPending}
            error={screen.variables?.search !== undefined ? screen.error : null}
            onChange={changeScreen}
          />
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
    const pending = prepare.isPending || submit.isPending;
    return (
      <Button
        ref={confirmationAction}
        type="button"
        variant="default"
        className="h-auto min-h-14 min-w-0 whitespace-normal px-4 py-2"
        aria-busy={pending}
        disabled={
          pending || cartPending || (!snapshot && (!data.cart.complete || !data.cart.lines.length))
        }
        onClick={(event) => {
          if (reviewing) submit.mutate({ confirmation: snapshot, pointer: event.detail > 0 });
          else if (snapshot) setSection("cart");
          else prepare.mutate();
        }}
      >
        {t("kiosk_confirm")}
        {pending ? (
          <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
        ) : (
          <Send aria-hidden />
        )}
      </Button>
    );
  }

  function renderHeader() {
    const { storeName, branding } = catalog.data?.configuration ?? {};
    return (
      <header
        data-theme-part="header"
        className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card px-3"
      >
        <div className="relative flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
          <div
            data-ui="header-branding"
            className="flex shrink-0 items-center gap-3 max-[70rem]:gap-1.5"
          >
            <a className="inline-flex shrink-0 items-center" href="?">
              <Brand className="w-28" />
            </a>
            <span
              aria-hidden
              data-ui="header-divider"
              className="h-8 shrink-0 border-l border-border"
            />
            <div
              data-ui="store-logo-banner"
              className="flex shrink-0 flex-nowrap items-center gap-2 max-[70rem]:gap-1"
            >
              <StoreLogo
                logo={branding?.banner}
                fallbackLogo={branding?.logo}
                width={160}
                height={40}
              />
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm max-xl:text-xs">
                <span className="font-medium">{storeName ?? data.storeName}</span>
                <strong className="text-muted-foreground">{data.tableName}</strong>
              </div>
            </div>
          </div>
          {renderVisitTools()}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <LanguageSwitch
              availableLanguages={catalog.data?.configuration.languages}
              onChange={(next) => language.mutate(next)}
            />
            <CurrencySelector compact />
          </div>
        </div>
        <StaffAssistance
          key={data.id}
          data={data}
          endpoint={endpoint}
          catalog={catalog.data}
          events={events}
          voice={voice}
          voiceBlocked={customerTargetUnconfirmed}
          onChoose={choose}
          onCallResult={(result) =>
            toasts.add({
              type: result,
              data: { icon: "staff" },
              title: t(result === "success" ? "kiosk_called_staff" : "kiosk_staff_request_failed"),
            })
          }
        />
      </header>
    );
  }
  function renderVisitTools() {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <CustomerVisitPanel
          key={data.id}
          endpoint={endpoint}
          sessionId={data.id}
          cursor={customerContextCursor}
        />
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
          <span>{resolveText(plan.rules.text, locale).displayName}</span>
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
          pending={submit.isPending}
        />
        <h3 className="px-4 pt-4 text-base font-semibold">{t("kiosk_orders")}</h3>
        <ErrorNotice query={history} />
        {history.isPending ? (
          <LoadingState cards />
        ) : orders.length === 0 && !history.isError ? (
          <div className="text-muted-foreground flex items-center flex-col text-center py-10 px-5 gap-2.5 [&_h3]:text-sm [&_h3]:font-medium [&_p]:text-xs [&_p]:leading-loose">
            {t("common_empty")}
          </div>
        ) : (
          orders.map((order) => (
            <article
              data-ui="order-card"
              className="m-3 overflow-hidden rounded-2xl border border-border bg-card"
              key={order.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-3 text-sm">
                <time>{time(order.createdAt, locale)}</time>
                <Badge variant="outline">{t(`order_${order.status}`)}</Badge>
                <span className="ml-auto font-semibold">
                  {t("common_total")}: <Money taxIncluded value={order.total} />
                </span>
              </div>
              <CartLines
                variant="receipt"
                lines={order.snapshot.lines}
                products={catalog.data?.configuration.products}
              />
              <CustomerOrderAttribution endpoint={endpoint} order={order} />
            </article>
          ))
        )}
        {history.hasNextPage && (
          <div className="flex justify-center p-4">
            <Button
              variant="outline"
              disabled={history.isFetchingNextPage}
              onClick={() => {
                void history.fetchNextPage();
              }}
            >
              {t("kiosk_more_orders")}
            </Button>
          </div>
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
                <Money taxIncluded value={data.bill.orderedTotal} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("kiosk_plan_charge")}</dt>
              <dd>
                <Money taxIncluded value={data.bill.planTotal} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("kiosk_adjustment")}</dt>
              <dd>
                <Money taxIncluded value={data.bill.adjustmentTotal} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("kiosk_paid")}</dt>
              <dd>
                <Money taxIncluded value={data.bill.paidTotal} />
              </dd>
            </div>
            <div data-ui="bill-total" className="">
              <dt className="text-muted-foreground">{t("kiosk_due")}</dt>
              <dd>
                <Money taxIncluded value={data.bill.due} />
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs mt-2.5">
            {t("kiosk_not_sent")}: <Money taxIncluded value={data.bill.cartTotal} />
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
      <ImageProvider
        basePath={endpoint.imageBasePath ?? "/api/table"}
        assets={catalog.data?.imageAssets}
      >
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
                  <ErrorNotice query={eventQuery} />
                  <KioskVoicePanel
                    voice={voice}
                    standbyBlocked={customerTargetUnconfirmed}
                    onWakeLanguage={(next) => language.mutateAsync(next)}
                    lines={conversationLines(events)}
                    events={events}
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
                    controlDisabled={
                      view.status === "stopping" ||
                      language.isPending ||
                      (!voiceActive && customerTargetUnconfirmed)
                    }
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
                <ResizablePanel
                  id="tablecast-order"
                  minSize="30%"
                  className="h-full"
                  onResize={(size) => {
                    if (horizontal) setOrderWidth(size.inPixels);
                    else setOrderWidth(orderPane.current?.clientWidth);
                  }}
                >
                  <aside
                    ref={orderPane}
                    data-theme-part="menu"
                    className="@container/tablecast-order relative isolate overflow-hidden h-full min-w-0 min-h-0 flex flex-col bg-card"
                  >
                    {renderPlanSummary()}
                    <ErrorNotice
                      error={screen.variables?.search !== undefined ? null : screen.error}
                    />
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
                        inert={productOpen}
                        className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
                      >
                        {renderMenu()}
                        {renderCart()}
                        {renderOrders()}
                      </div>
                      <div inert={productOpen} className="sticky bottom-0 shrink-0 bg-card">
                        <KioskMenuTabs
                          data={data}
                          cartLines={cartLines}
                          cartPending={cartPending}
                          products={catalog.data?.configuration.products}
                          cartActions={renderOrderActions()}
                          checkoutOpen={checkoutOpen && !selection}
                          onCheckoutOpenChange={setCheckoutOpen}
                          orderPane={orderPane}
                        />
                      </div>
                      <Dialog
                        open={productOpen}
                        modal={false}
                        onOpenChange={(open) => {
                          if (!open) setSection("menu");
                        }}
                      >
                        <DialogContent
                          side="pane"
                          container={orderPane}
                          aria-label={
                            selection
                              ? resolveText(selection.product.text, locale).displayName
                              : undefined
                          }
                          initialFocus={false}
                          finalFocus={() =>
                            detailTrigger.current?.isConnected
                              ? detailTrigger.current
                              : (orderPane.current?.querySelector<HTMLElement>(
                                  '[data-ui="cart-tab"]',
                                ) ?? false)
                          }
                        >
                          {selection && (
                            <ProductPage
                              endpoint={endpoint}
                              configVersion={data.configVersion}
                              tableSessionId={data.id}
                              imageSize={orderWidth && orderWidth < 576 ? 128 : 160}
                              key={selection.line?.id ?? selection.product.id}
                              product={selection.product}
                              initial={selection.line}
                              editing={selection.editing}
                              cartLimitReached={
                                cartLines.length >= maxCartLines &&
                                !(selection.editing ?? Boolean(selection.line))
                              }
                              busy={false}
                              error={selection.error}
                              onClose={() => setSection("menu")}
                              onSave={(line) => {
                                if (selection.failureId !== undefined)
                                  updateCart.clearFailure(selection.failureId);
                                updateCart.mutate({
                                  change: {
                                    type:
                                      (selection.editing ?? Boolean(selection.line))
                                        ? "edit"
                                        : "add",
                                    line,
                                  },
                                  configVersion: selection.configVersion,
                                  dismissProductId: selection.product.id,
                                });
                              }}
                            />
                          )}
                        </DialogContent>
                      </Dialog>
                    </Tabs.Root>
                    <ActionToasts container={orderPane} />
                    {updateCart.failures.map((failure) => (
                      <div key={failure.mutationId} className="space-y-2 p-3">
                        <ErrorNotice error={failure.error} />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateCart.clearFailure(failure.mutationId)}
                          >
                            {t("common_cancel")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateCart.retry(failure)}
                          >
                            {t("common_retry")}
                          </Button>
                        </div>
                      </div>
                    ))}
                    <ErrorNotice error={call.error || language.error || speed.error} />
                  </aside>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        </StoreTheme>
      </ImageProvider>
    );
  }
  return renderSession();
}

function KioskPaneHeader({
  title,
  label,
  amount,
  children,
  pending = false,
}: {
  amount: number;
  children?: ReactNode;
  label: string;
  pending?: boolean;
  title: string;
}) {
  const { t } = useI18n();
  return (
    <header
      data-ui="pane-heading"
      className="sticky top-0 z-10 space-y-3 border-b border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold outline-none">{title}</h2>
        <div className="ml-auto text-right">
          <span className="block text-sm text-muted-foreground">{label}</span>
          <strong className="block text-base">
            <Money taxIncluded value={amount} />
            {pending && (
              <span role="status" className="ml-2 text-sm font-normal text-muted-foreground">
                {t("kiosk_cart_syncing")}
              </span>
            )}
          </strong>
        </div>
      </div>
      {children}
    </header>
  );
}
