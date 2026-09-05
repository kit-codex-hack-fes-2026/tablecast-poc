import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  catalogSchema,
  orderSchema,
  snapshotSchema,
  tableStateSchema,
} from "@tablecast/api/schema";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import type {
  CartLine,
  Locale,
  PricedLine,
  Product,
  Snapshot,
  TableState,
} from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChevronRight, Mic, MicOff, ShoppingBag, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageSwitch } from "../../components/language-switch";
import { money, time, useI18n } from "../../i18n/locale";
import { api, ApiFailure, json } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { CartLines, ProductDialog, ProductMenu } from "./menu";
import { Pairing } from "./pairing";
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
      <main className="empty-page">
        <span className="brand">TableCast</span>
        <h1>{t("kiosk_closed")}</h1>
      </main>
    );
  if (table.data === null) return <Pairing onReady={refresh} />;
  if (!table.data)
    return (
      <main className="empty-page">
        <a className="brand" href="/">
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
    queryKey: ["tablecast-catalog", data.storeId],
    queryFn: () => api("/api/table/catalog", {}, catalogSchema),
    enabled: true,
  });
  const [view, setView] = useState<VoiceView>({ status: "idle" });
  const [voice] = useState(() => new VoiceConnection(setView, refresh));
  const [chosen, setChosen] = useState<{ product: Product; line?: CartLine }>();
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
    mutationFn: (lines: CartLine[]) =>
      api(
        "/api/table/cart",
        json("PUT", { expectedVersion: data.cart.version, lines }),
        tableStateSchema,
      ),
    onSuccess: (updated) => {
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
    if (product) setChosen({ product, line });
  }
  const voiceActive = view.error === "active" || !["idle", "paused", "error"].includes(view.status);

  return (
    <div className="kiosk-shell">
      <header className="kiosk-header">
        <div className="restaurant-lockup">
          <a className="brand" href="/">
            TableCast<span>·</span>
          </a>
          <div className="restaurant-name">
            <span className="restaurant-title" title={data.storeName}>
              {data.storeName}
            </span>
            <strong>{data.tableName}</strong>
          </div>
        </div>
        <div className="header-actions">
          <LanguageSwitch
            onChange={(next) => language.mutate(next)}
            disabled={language.isPending}
          />
          <Button
            variant="ghost"
            type="button"
            className={`voice-button ${voiceActive ? "voice-active" : ""}`}
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
            className="staff-button"
            onClick={() => call.mutate(false)}
            disabled={call.isPending || data.staffCalled}
          >
            <Bell size={20} aria-hidden="true" />
            {data.staffCalled ? t("kiosk_called_staff") : t("kiosk_call_staff")}
          </Button>
        </div>
      </header>
      <div className="kiosk-main">
        <VoicePanel
          view={view}
          lines={conversationLines(data.events)}
          onStart={() => {
            void voice.start(locale);
          }}
        />
        <aside className="menu-panel">
          {data.plan && (
            <div className="menu-panel-heading">
              <div className="plan-strip">
                <span>{data.plan.rules.text[locale].displayName}</span>
                <small>
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
            className="menu-tabs-root"
            value={section}
            onValueChange={(value) => {
              if (typeof value === "string") setSection(value);
            }}
          >
            <Tabs.List className="menu-tabs">
              <Tabs.Tab value="menu">{t("kiosk_menu")}</Tabs.Tab>
              <Tabs.Tab value="cart">
                {t("kiosk_cart")}
                <span className="count">
                  {data.cart.lines.reduce((sum, line) => sum + line.quantity, 0)}
                </span>
              </Tabs.Tab>
              <Tabs.Tab value="orders">{t("kiosk_orders")}</Tabs.Tab>
              <Tabs.Tab value="bill">{t("kiosk_bill")}</Tabs.Tab>
            </Tabs.List>
            <div className="menu-content">
              <Tabs.Panel value="menu">
                {catalog.data && (
                  <ProductMenu
                    catalog={catalog.data}
                    onChoose={(product) => setChosen({ product })}
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
                    updateCart.mutate(currentLines().filter((item) => item.id !== line.id))
                  }
                  disabled={updateCart.isPending}
                />
              </Tabs.Panel>
              <Tabs.Panel value="orders">
                {data.orders.length === 0 ? (
                  <div className="cart-empty">{t("common_empty")}</div>
                ) : (
                  data.orders.map((order) => (
                    <article className="order-card" key={order.id}>
                      <div className="order-header">
                        <time>{time(order.createdAt, locale)}</time>
                        <Badge variant="outline">{t(`order_${order.status}`)}</Badge>
                      </div>
                      <CartLines lines={order.snapshot.lines} />
                    </article>
                  ))
                )}
              </Tabs.Panel>
              <Tabs.Panel value="bill">
                <div className="bill-summary">
                  <h3>{t("kiosk_bill")}</h3>
                  <dl>
                    <div>
                      <dt>{t("admin_ordered")}</dt>
                      <dd>{money(data.bill.orderedTotal, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t("kiosk_plan_charge")}</dt>
                      <dd>{money(data.bill.planTotal, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t("kiosk_adjustment")}</dt>
                      <dd>{money(data.bill.adjustmentTotal, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t("kiosk_paid")}</dt>
                      <dd>{money(data.bill.paidTotal, locale)}</dd>
                    </div>
                    <div className="bill-total">
                      <dt>{t("kiosk_due")}</dt>
                      <dd>{money(data.bill.due, locale)}</dd>
                    </div>
                  </dl>
                  <p>
                    {t("kiosk_not_sent")}: {money(data.bill.cartTotal, locale)}
                  </p>
                  <Button
                    variant="default"
                    size="lg"
                    type="button"
                    className="primary-button"
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
          <div className="basket-footer">
            <Button
              variant="ghost"
              type="button"
              className="basket-total"
              onClick={() => setSection("cart")}
            >
              <ShoppingBag size={20} aria-hidden="true" />
              <span>
                {t("kiosk_cart")}
                <strong>{money(data.cart.total, locale)}</strong>
              </span>
              <small>{t("common_price_note")}</small>
            </Button>
            <Button
              variant="default"
              size="lg"
              type="button"
              className="primary-button review-button"
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
      {chosen && (
        <ProductDialog
          key={chosen.line?.id ?? chosen.product.id}
          product={chosen.product}
          initial={chosen.line}
          busy={updateCart.isPending}
          onClose={() => setChosen(undefined)}
          onSave={(line) =>
            updateCart.mutate([...currentLines().filter((item) => item.id !== line.id), line])
          }
        />
      )}
      <Dialog.Root
        open={!!snapshot}
        onOpenChange={(open) => {
          if (!open && !submit.isPending) setSnapshot(undefined);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Viewport className="dialog-viewport">
            <Dialog.Popup className="dialog confirmation-dialog">
              <div className="dialog-heading">
                <Dialog.Close
                  className="icon-button ml-auto"
                  aria-label={t("common_close")}
                  disabled={submit.isPending}
                >
                  <X size={22} />
                </Dialog.Close>
              </div>
              <Dialog.Title>{t("kiosk_review_title")}</Dialog.Title>
              <Dialog.Description>{t("kiosk_review_note")}</Dialog.Description>
              {snapshot && (
                <>
                  <div className="dialog-scroll">
                    <CartLines lines={snapshot.lines} />
                    {snapshot.plan && (
                      <p>
                        {t("kiosk_plan")}: {snapshot.plan.name[locale]}
                      </p>
                    )}
                  </div>
                  <div className="confirmation-total">
                    <span>{t("common_total")}</span>
                    <strong>{money(snapshot.total, locale)}</strong>
                  </div>
                  <p className="muted">{t("common_price_note")}</p>
                </>
              )}
              <ErrorNotice error={submit.error} />
              <div className="dialog-actions">
                <Dialog.Close className="secondary-button" disabled={submit.isPending}>
                  {t("kiosk_edit")}
                </Dialog.Close>
                <Button
                  variant="default"
                  size="lg"
                  type="button"
                  className="primary-button"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate()}
                >
                  {t("kiosk_confirm")}
                  <Check size={18} aria-hidden="true" />
                </Button>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={ordered} onOpenChange={setOrdered}>
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Viewport className="dialog-viewport">
            <Dialog.Popup className="dialog success-dialog">
              <div className="success-mark">
                <Check size={36} aria-hidden="true" />
              </div>
              <Dialog.Title>{t("kiosk_ordered")}</Dialog.Title>
              <Dialog.Close className="primary-button">{t("common_close")}</Dialog.Close>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
