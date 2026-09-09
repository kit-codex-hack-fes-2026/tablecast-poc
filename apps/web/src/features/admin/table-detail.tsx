import { useHydrated, Link } from "@tanstack/react-router";
import { Tabs } from "@base-ui/react/tabs";
import type { Order } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { money, time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { CartLines } from "../kiosk/cart-lines";
import { tableDetailOptions } from "../store/store-query";
import { ActivityLog } from "./events";
import { SessionActivity } from "./session-activity";

function useTableDetail({
  storeId,
  tableId,
}: {
  storeId: string;
  tableId: string;
  view: "overview" | "logs" | "orders" | "billing" | "diagnostics";
  onViewChange: (view: "overview" | "logs" | "orders" | "billing" | "diagnostics") => void;
}) {
  const { t, locale } = useI18n();
  const route = rpc.api.admin.stores[":storeId"];
  const param = { storeId, id: tableId };
  const detail = useQuery(tableDetailOptions(storeId, tableId));
  const client = useQueryClient();
  useRealtime(
    detail.data?.status === "open" ? { storeId } : undefined,
    detail.data?.cursor ?? 0,
    () => {
      void client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, tableId] });
      void client.invalidateQueries({ queryKey: ["tablecast-session-events", storeId, tableId] });
    },
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [paymentKind, setPaymentKind] = useState<"payment" | "adjustment">("payment");
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const action = useMutation({
    mutationFn: async (
      operation:
        | { kind: "close" }
        | { kind: "resolve" }
        | { kind: "order"; id: string; status: Exclude<Order["status"], "submitted"> },
    ) => {
      if (operation.kind === "close")
        return parseResponse(route.tables[":id"].close.$post({ param }));
      if (operation.kind === "resolve")
        return parseResponse(route.tables[":id"].call.resolve.$post({ param }));
      return parseResponse(
        route.orders[":id"].status.$post({
          param: { storeId, id: operation.id },
          json: { status: operation.status },
        }),
      );
    },
    onSuccess: () => {
      void detail.refetch();
    },
  });
  const payment = useMutation({
    mutationFn: () =>
      parseResponse(
        route.tables[":id"].payments.$post({
          param,
          json: { amount: Number(amount), kind: paymentKind, reason, idempotencyKey: paymentKey },
        }),
      ),
    onSuccess: () => {
      setAmount("");
      setReason("");
      setPaymentKey(crypto.randomUUID());
      void detail.refetch();
    },
  });
  function orderStatus(order: Order, status: Exclude<Order["status"], "submitted">) {
    action.mutate({ kind: "order", id: order.id, status });
  }
  const table = detail.data;
  return {
    t,
    locale,
    detail,
    amount,
    setAmount,
    reason,
    setReason,
    paymentKind,
    setPaymentKind,
    setPaymentKey,
    action,
    payment,
    orderStatus,
    table,
  };
}
export function TableDetail({
  storeId,
  tableId,
  view,
  onViewChange,
}: {
  storeId: string;
  tableId: string;
  view: "overview" | "logs" | "orders" | "billing" | "diagnostics";
  onViewChange: (view: "overview" | "logs" | "orders" | "billing" | "diagnostics") => void;
}) {
  const hydrated = useHydrated();
  const {
    t,
    locale,
    detail,
    amount,
    setAmount,
    reason,
    setReason,
    paymentKind,
    setPaymentKind,
    setPaymentKey,
    action,
    payment,
    orderStatus,
    table,
  } = useTableDetail({ storeId, tableId, view, onViewChange });
  return (
    <section className="space-y-5">
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        render={<Link to="/admin/stores/$storeId/visits" params={{ storeId }} />}
      >
        <ArrowLeft />
        {t("admin_history")}
      </Button>
      <h1 className="text-2xl font-semibold">{table?.tableName ?? t("common_loading")}</h1>
      {table && (
        <p className="text-base text-muted-foreground">
          {table.guestCount} {t("admin_guests")} · {table.locale === "ja" ? "日本語" : "English"} ·{" "}
          <DateTime value={table.openedAt} />
        </p>
      )}
      <ErrorNotice error={detail.error || action.error} />
      {table && (
        <Tabs.Root
          className="flex min-h-0 flex-1 flex-col"
          value={view}
          onValueChange={(next) => {
            if (
              next === "overview" ||
              next === "logs" ||
              next === "orders" ||
              next === "billing" ||
              next === "diagnostics"
            )
              onViewChange(next);
          }}
        >
          <Tabs.List className="flex overflow-x-auto border-b border-b-border shrink-0 [&_button]:whitespace-nowrap [&_button]:text-sm [&_button]:min-h-12 [&_button]:py-2.5 [&_button]:px-3 [&_button]:border-b-2 [&_button]:border-b-transparent [&_button]:text-muted-foreground [&_button[data-active]]:text-primary [&_button[data-active]]:font-semibold [&_button[data-active]]:border-b-primary">
            <Tabs.Tab disabled={!hydrated} value="overview">
              {t("admin_overview")}
            </Tabs.Tab>
            <Tabs.Tab disabled={!hydrated} value="logs">
              {t("admin_logs")}
            </Tabs.Tab>
            <Tabs.Tab disabled={!hydrated} value="orders">
              {t("admin_orders")}
            </Tabs.Tab>
            <Tabs.Tab disabled={!hydrated} value="billing">
              {t("admin_payments")}
            </Tabs.Tab>
            <Tabs.Tab disabled={!hydrated} value="diagnostics">
              {t("admin_diagnostics")}
            </Tabs.Tab>
          </Tabs.List>
          <div className="overflow-y-auto min-h-0 pt-6 px-0 pb-9 [&_[data-ui=order-card]]:my-3.5 [&_[data-ui=order-card]]:mx-0 [&_[data-ui=bill-summary]]:pt-0 [&_[data-ui=bill-summary]]:px-0 [&_[data-ui=bill-summary]]:pb-6">
            <Tabs.Panel value="overview">
              <div className="grid grid-cols-3 border border-border rounded-md [&_>_div:last-child]:border-0 max-sm:grid-cols-2 max-sm:[&_>_div:last-child]:col-span-full max-sm:[&_>_div:last-child]:border-t max-sm:[&_>_div:last-child]:border-t-border">
                <div className="py-4 px-3.5 border-r border-r-border">
                  <span className="text-muted-foreground text-sm">{t("admin_due")}</span>
                  <strong className="block text-lg mt-2">{money(table.bill.due, locale)}</strong>
                </div>
                <div className="py-4 px-3.5 border-r border-r-border">
                  <span className="text-muted-foreground text-sm">{t("admin_cart")}</span>
                  <strong className="block text-lg mt-2">{money(table.cart.total, locale)}</strong>
                </div>
                <div className="py-4 px-3.5 border-r border-r-border">
                  <span className="text-muted-foreground text-sm">{t("admin_voice")}</span>
                  <strong className="block text-lg mt-2">
                    {table.voiceState === "active"
                      ? t("admin_active_voice")
                      : table.voiceState === "error"
                        ? t("admin_error_voice")
                        : t("admin_stopped")}
                  </strong>
                </div>
              </div>
              {table.staffCalled && (
                <div className="flex justify-between items-center bg-accent-soft p-3.5 rounded-md mt-5 gap-3.5">
                  <strong className="text-base">{t("admin_attention")}</strong>
                  {table.status === "open" && (
                    <Button
                      className="min-h-11 text-sm"
                      size="lg"
                      variant="outline"
                      type="button"

                      disabled={action.isPending}
                      onClick={() => action.mutate({ kind: "resolve" })}
                    >
                      {t("admin_acknowledge")}
                    </Button>
                  )}
                </div>
              )}
              {table.plan && (
                <p>
                  {t("kiosk_plan")}: {table.plan.rules.text[locale].displayName}
                </p>
              )}
              <h3 className="mt-5 mx-0 mb-3.5">{t("admin_updated")}</h3>
              <ActivityLog
                events={table.events.slice(-5)}
                includeDate={table.status === "closed"}
              />
              {table.status === "open" && (
                <Button
                  size="text"
                  variant="link"
                  type="button"
                  className="text-destructive"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ kind: "close" })}
                >
                  {t("admin_close_session")}
                </Button>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="logs">
              <SessionActivity
                storeId={storeId}
                sessionId={table.id}
                closed={table.status === "closed"}
              />
            </Tabs.Panel>
            <SessionOrders table={table} action={action} orderStatus={orderStatus} />
            <Tabs.Panel value="billing">
              <div
                data-ui="bill-summary"
                className="py-6 px-5 [&_h3]:mb-5 [&_dl_>_div]:flex [&_dl_>_div]:items-center [&_dl_>_div]:justify-between [&_dl_>_div]:py-2 [&_dl_>_div]:px-0 [&_dl_>_div]:gap-3 [&_dl_>_div]:text-base [&_[data-ui=bill-total]]:border-t [&_[data-ui=bill-total]]:border-t-border [&_[data-ui=bill-total]]:pt-4 [&_[data-ui=bill-total]]:mt-2.5 [&_[data-ui=bill-total]_dd]:text-2xl [&_[data-ui=bill-total]_dd]:font-semibold [&_p]:text-muted-foreground [&_p]:text-sm [&_p]:mt-2.5 [&_[data-slot=button][data-variant=default]]:mt-6 [&_[data-slot=button][data-variant=default]]:w-full"
              >
                <dl>
                  <div>
                    <dt className="text-muted-foreground">{t("admin_ordered")}</dt>
                    <dd>{money(table.bill.orderedTotal, locale)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("kiosk_plan_charge")}</dt>
                    <dd>{money(table.bill.planTotal, locale)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("kiosk_adjustment")}</dt>
                    <dd>{money(table.bill.adjustmentTotal, locale)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("kiosk_paid")}</dt>
                    <dd>{money(table.bill.paidTotal, locale)}</dd>
                  </div>
                  <div data-ui="bill-total" className="">
                    <dt className="text-muted-foreground">{t("admin_due")}</dt>
                    <dd>{money(table.bill.due, locale)}</dd>
                  </div>
                </dl>
              </div>
              {table.status === "open" && (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    payment.mutate();
                  }}
                >
                  <h3 className="m-0">{t("admin_payment")}</h3>
                  <p className="text-muted-foreground text-sm">{t("admin_payment_note")}</p>
                  <div className="flex flex-wrap gap-5">
                    <label className="flex gap-2 items-center text-sm min-h-11">
                      <Input
                        type="radio"
                        name="paymentKind"
                        value="payment"
                        checked={paymentKind === "payment"}
                        onChange={() => {
                          setPaymentKind("payment");
                          setPaymentKey(crypto.randomUUID());
                        }}
                      />
                      {t("admin_payment")}
                    </label>
                    <label className="flex gap-2 items-center text-sm min-h-11">
                      <Input
                        type="radio"
                        name="paymentKind"
                        value="adjustment"
                        checked={paymentKind === "adjustment"}
                        onChange={() => {
                          setPaymentKind("adjustment");
                          setPaymentKey(crypto.randomUUID());
                        }}
                      />
                      {t("admin_adjustment")}
                    </label>
                  </div>
                  <label className="flex flex-col gap-2 text-sm">
                    {t("admin_amount")}
                    <Input
                      type="number"
                      step="1"
                      min={paymentKind === "payment" ? 1 : undefined}
                      required
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value);
                        setPaymentKey(crypto.randomUUID());
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    {t("admin_reason")}
                    <Input
                      type="text"
                      required
                      maxLength={500}
                      value={reason}
                      onChange={(event) => {
                        setReason(event.target.value);
                        setPaymentKey(crypto.randomUUID());
                      }}
                    />
                  </label>
                  <ErrorNotice error={payment.error} />
                  <Button
                    variant="default"
                    size="lg"

                    type="submit"
                    disabled={payment.isPending}
                  >
                    {paymentKind === "payment" ? t("admin_payment") : t("admin_adjustment")}
                  </Button>
                </form>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="diagnostics">
              <dl className="">
                <div className="border-b border-b-border py-3.5 px-0">
                  <dt className="text-sm text-muted-foreground">tableSessionId</dt>
                  <dd className="font-mono text-sm wrap-anywhere mt-1">{table.id}</dd>
                </div>
                <div className="border-b border-b-border py-3.5 px-0">
                  <dt className="text-sm text-muted-foreground">voiceSessionId</dt>
                  <dd className="font-mono text-sm wrap-anywhere mt-1">
                    {table.voiceSessionId ?? "—"}
                  </dd>
                </div>
                <div className="border-b border-b-border py-3.5 px-0">
                  <dt className="text-sm text-muted-foreground">cursor</dt>
                  <dd className="font-mono text-sm wrap-anywhere mt-1">{table.cursor}</dd>
                </div>
                <div className="border-b border-b-border py-3.5 px-0">
                  <dt className="text-sm text-muted-foreground">cart.version</dt>
                  <dd className="font-mono text-sm wrap-anywhere mt-1">{table.cart.version}</dd>
                </div>
              </dl>
            </Tabs.Panel>
          </div>
        </Tabs.Root>
      )}
    </section>
  );
}

function SessionOrders({
  table,
  action,
  orderStatus,
}: {
  table: NonNullable<ReturnType<typeof useTableDetail>["table"]>;
  action: NonNullable<ReturnType<typeof useTableDetail>["action"]>;
  orderStatus: NonNullable<ReturnType<typeof useTableDetail>["orderStatus"]>;
}) {
  const { t, locale } = useI18n();
  return (
    <Tabs.Panel value="orders">
      <h3 className="mt-5 mx-0 mb-3.5">{t("kiosk_cart")}</h3>
      <CartLines lines={table.cart.lines} />
      <h3 className="mt-5 mx-0 mb-3.5">{t("kiosk_orders")}</h3>
      {table.orders.map((order) => (
        <article
          key={order.id}
          data-ui="order-card"
          className="border border-border rounded-md m-3.5 overflow-hidden"
        >
          <div className="flex justify-between items-center gap-2 py-3 px-3.5 border-b border-b-border bg-background text-sm">
            <time>{time(order.createdAt, locale)}</time>
            <Badge variant="secondary">{t(`order_${order.status}`)}</Badge>
            <strong className="text-base">{money(order.total, locale)}</strong>
          </div>
          <CartLines lines={order.snapshot.lines} />
          {table.status === "open" && (
            <div className="flex gap-2.5 pt-0 px-3.5 pb-3.5 flex-wrap [&_[data-slot=button][data-variant=default]]:min-h-11 [&_[data-slot=button][data-variant=default]]:text-sm">
              {order.status === "submitted" && (
                <>
                  <Button
                    variant="default"
                    size="lg"
                    type="button"

                    disabled={action.isPending}
                    onClick={() => orderStatus(order, "accepted")}
                  >
                    {t("admin_accept")}
                  </Button>
                  <Button
                    size="text"
                    variant="link"
                    type="button"
                    className="text-destructive"
                    disabled={action.isPending}
                    onClick={() => orderStatus(order, "rejected")}
                  >
                    {t("admin_reject")}
                  </Button>
                </>
              )}
              {order.status === "accepted" && (
                <Button
                  variant="default"
                  size="lg"
                  type="button"

                  disabled={action.isPending}
                  onClick={() => orderStatus(order, "served")}
                >
                  {t("admin_serve")}
                </Button>
              )}
              {(order.status === "submitted" || order.status === "accepted") && (
                <Button
                  size="text"
                  variant="link"
                  type="button"
                  className="text-destructive"
                  disabled={action.isPending}
                  onClick={() => orderStatus(order, "cancelled")}
                >
                  {t("admin_cancel_order")}
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
    </Tabs.Panel>
  );
}
