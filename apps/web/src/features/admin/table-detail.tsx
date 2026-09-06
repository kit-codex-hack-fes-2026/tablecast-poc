import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { tableStateSchema } from "@tablecast/api/schema";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import type { Order } from "@tablecast/api/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { money, time, useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";
import { CartLines } from "../kiosk/menu";
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
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="drawer-viewport">
          <Dialog.Popup className="drawer">
            <div className="dialog-heading">
              <span className="eyebrow">{t("admin_details")}</span>
              <Dialog.Close className="icon-button" aria-label={t("common_close")}>
                <X size={22} />
              </Dialog.Close>
            </div>
            <Dialog.Title>{table?.tableName ?? t("common_loading")}</Dialog.Title>
            <Dialog.Description>
              {table
                ? `${table.guestCount} ${t("admin_guests")} · ${table.locale === "ja" ? "日本語" : "English"}`
                : t("common_loading")}
            </Dialog.Description>
            <ErrorNotice error={detail.error || action.error} />
            {table && (
              <Tabs.Root defaultValue="overview">
                <Tabs.List className="detail-tabs">
                  <Tabs.Tab value="overview">{t("admin_overview")}</Tabs.Tab>
                  <Tabs.Tab value="logs">{t("admin_logs")}</Tabs.Tab>
                  <Tabs.Tab value="orders">{t("admin_orders")}</Tabs.Tab>
                  <Tabs.Tab value="billing">{t("admin_payments")}</Tabs.Tab>
                  <Tabs.Tab value="diagnostics">{t("admin_diagnostics")}</Tabs.Tab>
                </Tabs.List>
                <div className="detail-content">
                  <Tabs.Panel value="overview">
                    <div className="detail-metrics">
                      <div>
                        <span>{t("admin_due")}</span>
                        <strong>{money(table.bill.due, locale)}</strong>
                      </div>
                      <div>
                        <span>{t("admin_cart")}</span>
                        <strong>{money(table.cart.total, locale)}</strong>
                      </div>
                      <div>
                        <span>{t("admin_voice")}</span>
                        <strong>
                          {table.voiceState === "active"
                            ? t("admin_active_voice")
                            : table.voiceState === "error"
                              ? t("admin_error_voice")
                              : t("admin_stopped")}
                        </strong>
                      </div>
                    </div>
                    {table.staffCalled && (
                      <div className="attention-box">
                        <strong>{t("admin_attention")}</strong>
                        {table.status === "open" && (
                          <Button
                            variant="outline"
                            type="button"
                            className="secondary-button"
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
                    <h3>{t("admin_updated")}</h3>
                    <ActivityLog
                      events={table.events.slice(-5)}
                      includeDate={table.status === "closed"}
                    />
                    {table.status === "open" && (
                      <Button
                        variant="ghost"
                        type="button"
                        className="text-button danger"
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
                    <h3>{t("kiosk_cart")}</h3>
                    <CartLines lines={table.cart.lines} />
                    <h3>{t("kiosk_orders")}</h3>
                    {table.orders.map((order) => (
                      <article key={order.id} className="order-card">
                        <div className="order-header">
                          <time>{time(order.createdAt, locale)}</time>
                          <span className="chip">{t(`order_${order.status}`)}</span>
                          <strong>{money(order.total, locale)}</strong>
                        </div>
                        <CartLines lines={order.snapshot.lines} />
                        {table.status === "open" && (
                          <div className="order-actions">
                            {order.status === "submitted" && (
                              <>
                                <Button
                                  variant="default"
                                  size="lg"
                                  type="button"
                                  className="primary-button"
                                  disabled={action.isPending}
                                  onClick={() => orderStatus(order, "accepted")}
                                >
                                  {t("admin_accept")}
                                </Button>
                                <Button
                                  variant="ghost"
                                  type="button"
                                  className="text-button danger"
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
                                className="primary-button"
                                disabled={action.isPending}
                                onClick={() => orderStatus(order, "served")}
                              >
                                {t("admin_serve")}
                              </Button>
                            )}
                            {(order.status === "submitted" || order.status === "accepted") && (
                              <Button
                                variant="ghost"
                                type="button"
                                className="text-button danger"
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
                    <div className="bill-summary">
                      <dl>
                        <div>
                          <dt>{t("admin_ordered")}</dt>
                          <dd>{money(table.bill.orderedTotal, locale)}</dd>
                        </div>
                        <div>
                          <dt>{t("kiosk_plan_charge")}</dt>
                          <dd>{money(table.bill.planTotal, locale)}</dd>
                        </div>
                        <div>
                          <dt>{t("kiosk_adjustment")}</dt>
                          <dd>{money(table.bill.adjustmentTotal, locale)}</dd>
                        </div>
                        <div>
                          <dt>{t("kiosk_paid")}</dt>
                          <dd>{money(table.bill.paidTotal, locale)}</dd>
                        </div>
                        <div className="bill-total">
                          <dt>{t("admin_due")}</dt>
                          <dd>{money(table.bill.due, locale)}</dd>
                        </div>
                      </dl>
                    </div>
                    {table.status === "open" && (
                      <form
                        className="payment-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          payment.mutate();
                        }}
                      >
                        <h3>{t("admin_payment")}</h3>
                        <p>{t("admin_payment_note")}</p>
                        <div className="form-segment">
                          <label>
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
                          <label>
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
                        <label>
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
                        <label>
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
                          className="primary-button"
                          type="submit"
                          disabled={payment.isPending}
                        >
                          {paymentKind === "payment" ? t("admin_payment") : t("admin_adjustment")}
                        </Button>
                      </form>
                    )}
                  </Tabs.Panel>
                  <Tabs.Panel value="diagnostics">
                    <dl className="diagnostics">
                      <div>
                        <dt>tableSessionId</dt>
                        <dd>{table.id}</dd>
                      </div>
                      <div>
                        <dt>voiceSessionId</dt>
                        <dd>{table.voiceSessionId ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>cursor</dt>
                        <dd>{table.cursor}</dd>
                      </div>
                      <div>
                        <dt>cart.version</dt>
                        <dd>{table.cart.version}</dd>
                      </div>
                    </dl>
                  </Tabs.Panel>
                </div>
              </Tabs.Root>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
