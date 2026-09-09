import { Tabs } from "@base-ui/react/tabs";
import type { Order } from "@tablecast/api/schema";
import { tableStateSchema } from "@tablecast/api/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { money, time, useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";
import { CartLines } from "../kiosk/cart-lines";
import { ActivityLog } from "./events";
import { SessionActivity } from "./session-activity";

export function TableDetail({
  storeId,
  tableId,
  onClose,
  onUpdate,
}: {
  storeId: string;
  tableId: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { t, locale } = useI18n();
  const base = `/api/admin/stores/${storeId}`;
  const detail = useQuery({
    queryKey: ["tablecast-table-detail", storeId, tableId],
    queryFn: ({ signal }) => api(`${base}/tables/${tableId}`, { signal }, tableStateSchema),
    refetchInterval: (query) => (query.state.data?.status === "closed" ? false : 5000),
  });
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [paymentKind, setPaymentKind] = useState<"payment" | "adjustment">("payment");
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api(`${base}/${path}`, json("POST", body)),
    onSuccess: () => {
      void detail.refetch();
      onUpdate();
    },
  });
  const payment = useMutation({
    mutationFn: () =>
      api(
        `${base}/tables/${tableId}/payments`,
        json("POST", {
          amount: Number(amount),
          kind: paymentKind,
          reason,
          idempotencyKey: paymentKey,
        }),
      ),
    onSuccess: () => {
      setAmount("");
      setReason("");
      setPaymentKey(crypto.randomUUID());
      void detail.refetch();
      onUpdate();
    },
  });
  function orderStatus(order: Order, status: Order["status"]) {
    action.mutate({ path: `orders/${order.id}/status`, body: { status } });
  }
  const table = detail.data;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent side="right">
        <DialogHeader>
          <span className="eyebrow block text-xs leading-relaxed tracking-widest font-semibold text-muted-foreground">
            {t("admin_details")}
          </span>
          <DialogClose aria-label={t("common_close")}>
            <X size={22} />
          </DialogClose>
        </DialogHeader>
        <DialogTitle className="text-3xl">{table?.tableName ?? t("common_loading")}</DialogTitle>
        <DialogDescription className="mb-5">
          {table
            ? `${table.guestCount} ${t("admin_guests")} · ${table.locale === "ja" ? "日本語" : "English"}`
            : t("common_loading")}
        </DialogDescription>
        <ErrorNotice error={detail.error || action.error} />
        {table && (
          <Tabs.Root className="flex min-h-0 flex-1 flex-col" defaultValue="overview">
            <Tabs.List className="flex overflow-x-auto border-b border-b-border shrink-0 [&_button]:whitespace-nowrap [&_button]:text-xs [&_button]:min-h-12 [&_button]:py-2.5 [&_button]:px-3 [&_button]:border-b-2 [&_button]:border-b-transparent [&_button]:text-muted-foreground [&_button[data-active]]:text-primary [&_button[data-active]]:font-semibold [&_button[data-active]]:border-b-primary">
              <Tabs.Tab value="overview">{t("admin_overview")}</Tabs.Tab>
              <Tabs.Tab value="logs">{t("admin_logs")}</Tabs.Tab>
              <Tabs.Tab value="orders">{t("admin_orders")}</Tabs.Tab>
              <Tabs.Tab value="billing">{t("admin_payments")}</Tabs.Tab>
              <Tabs.Tab value="diagnostics">{t("admin_diagnostics")}</Tabs.Tab>
            </Tabs.List>
            <div className="overflow-y-auto min-h-0 pt-6 px-0 pb-9 [&_.order-card]:my-3.5 [&_.order-card]:mx-0 [&_.bill-summary]:pt-0 [&_.bill-summary]:px-0 [&_.bill-summary]:pb-6">
              <Tabs.Panel value="overview">
                <div className="grid grid-cols-3 border border-border rounded-md [&_>_div:last-child]:border-0 max-sm:grid-cols-2 max-sm:[&_>_div:last-child]:col-span-full max-sm:[&_>_div:last-child]:border-t max-sm:[&_>_div:last-child]:border-t-border">
                  <div className="py-4 px-3.5 border-r border-r-border">
                    <span className="text-muted-foreground text-xs">{t("admin_due")}</span>
                    <strong className="block text-lg mt-2">{money(table.bill.due, locale)}</strong>
                  </div>
                  <div className="py-4 px-3.5 border-r border-r-border">
                    <span className="text-muted-foreground text-xs">{t("admin_cart")}</span>
                    <strong className="block text-lg mt-2">
                      {money(table.cart.total, locale)}
                    </strong>
                  </div>
                  <div className="py-4 px-3.5 border-r border-r-border">
                    <span className="text-muted-foreground text-xs">{t("admin_voice")}</span>
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
                    <strong className="text-sm">{t("admin_attention")}</strong>
                    {table.status === "open" && (
                      <Button
                        className="min-h-11 text-xs"
                        size="lg"
                        variant="outline"
                        type="button"

                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({ path: `tables/${tableId}/call/resolve`, body: {} })
                        }
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
                    onClick={() => action.mutate({ path: `tables/${tableId}/close`, body: {} })}
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
              <Tabs.Panel value="orders">
                <h3 className="mt-5 mx-0 mb-3.5">{t("kiosk_cart")}</h3>
                <CartLines lines={table.cart.lines} />
                <h3 className="mt-5 mx-0 mb-3.5">{t("kiosk_orders")}</h3>
                {table.orders.map((order) => (
                  <article
                    key={order.id}
                    className="order-card border border-border rounded-md m-3.5 overflow-hidden"
                  >
                    <div className="flex justify-between items-center gap-2 py-3 px-3.5 border-b border-b-border bg-background text-xs">
                      <time>{time(order.createdAt, locale)}</time>
                      <Badge variant="secondary">{t(`order_${order.status}`)}</Badge>
                      <strong className="text-sm">{money(order.total, locale)}</strong>
                    </div>
                    <CartLines lines={order.snapshot.lines} />
                    {table.status === "open" && (
                      <div className="flex gap-2.5 pt-0 px-3.5 pb-3.5 flex-wrap [&_[data-slot=button][data-variant=default]]:min-h-11 [&_[data-slot=button][data-variant=default]]:text-xs">
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
              <Tabs.Panel value="billing">
                <div className="bill-summary py-6 px-5 [&_h3]:mb-5 [&_dl_>_div]:flex [&_dl_>_div]:items-center [&_dl_>_div]:justify-between [&_dl_>_div]:py-2 [&_dl_>_div]:px-0 [&_dl_>_div]:gap-3 [&_dl_>_div]:text-sm [&_.bill-total]:border-t [&_.bill-total]:border-t-border [&_.bill-total]:pt-4 [&_.bill-total]:mt-2.5 [&_.bill-total_dd]:text-2xl [&_.bill-total_dd]:font-semibold [&_p]:text-muted-foreground [&_p]:text-xs [&_p]:mt-2.5 [&_[data-slot=button][data-variant=default]]:mt-6 [&_[data-slot=button][data-variant=default]]:w-full">
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
                    <div className="bill-total">
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
                    <p className="text-muted-foreground text-xs">{t("admin_payment_note")}</p>
                    <div className="flex flex-wrap gap-5">
                      <label className="flex gap-2 items-center text-xs min-h-11">
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
                      <label className="flex gap-2 items-center text-xs min-h-11">
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
                    <label className="flex flex-col gap-2 text-xs">
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
                    <label className="flex flex-col gap-2 text-xs">
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
                    <dt className="text-xs text-muted-foreground">tableSessionId</dt>
                    <dd className="font-mono text-xs wrap-anywhere mt-1">{table.id}</dd>
                  </div>
                  <div className="border-b border-b-border py-3.5 px-0">
                    <dt className="text-xs text-muted-foreground">voiceSessionId</dt>
                    <dd className="font-mono text-xs wrap-anywhere mt-1">
                      {table.voiceSessionId ?? "—"}
                    </dd>
                  </div>
                  <div className="border-b border-b-border py-3.5 px-0">
                    <dt className="text-xs text-muted-foreground">cursor</dt>
                    <dd className="font-mono text-xs wrap-anywhere mt-1">{table.cursor}</dd>
                  </div>
                  <div className="border-b border-b-border py-3.5 px-0">
                    <dt className="text-xs text-muted-foreground">cart.version</dt>
                    <dd className="font-mono text-xs wrap-anywhere mt-1">{table.cart.version}</dd>
                  </div>
                </dl>
              </Tabs.Panel>
            </div>
          </Tabs.Root>
        )}
      </DialogContent>
    </Dialog>
  );
}
