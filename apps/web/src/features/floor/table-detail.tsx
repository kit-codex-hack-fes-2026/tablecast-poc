import { useHydrated } from "@tanstack/react-router";
import { Activity, LayoutDashboard, MessagesSquare, ReceiptText, Wallet } from "lucide-react";
import { Suspense } from "react";
import type { FloorSearch } from "./floor-model";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import * as Tabs from "../../components/ui/tabs";
import { money } from "../../i18n/format";
import { CouponVisit } from "../rewards/coupon-visit";
import { PointVisit } from "../rewards/point-visit";
import { ActivityLog } from "./events";
import { PaymentForm } from "./payment-form";
import { SessionActivity } from "./session-activity";
import { SessionOrders, TableDetailHeader } from "./table-detail-orders";
import { useTableDetail } from "./table-detail-state";

export function TableDetail({
  storeId,
  tableId,
  view,
  onViewChange,
  floorSearch,
}: {
  floorSearch?: FloorSearch;
  onViewChange: (view: "billing" | "diagnostics" | "logs" | "orders" | "overview") => void;
  storeId: string;
  tableId: string;
  view: "billing" | "diagnostics" | "logs" | "orders" | "overview";
}) {
  const hydrated = useHydrated();
  const { t, locale, detail, action, orderStatus, table } = useTableDetail({
    storeId,
    tableId,
    view,
    onViewChange,
  });
  return (
    <section className="space-y-5">
      <TableDetailHeader table={table} storeId={storeId} floorSearch={floorSearch} />
      <ErrorNotice error={detail.error || action.error} />
      {table && (
        <Tabs.Root
          className="flex min-h-0 flex-1 flex-col"
          value={view}
          onValueChange={(next: unknown) => {
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
          <Tabs.List className="max-w-full">
            <Tabs.Tab disabled={!hydrated} value="overview">
              <LayoutDashboard aria-hidden />
              {t("admin_overview")}
            </Tabs.Tab>
            <Tabs.Tab disabled={!hydrated} value="logs">
              <MessagesSquare aria-hidden />
              {t("admin_logs")}
            </Tabs.Tab>
            <Tabs.Tab disabled={!hydrated} value="orders">
              <ReceiptText aria-hidden />
              {t("admin_orders")}
            </Tabs.Tab>
            <Tabs.Tab disabled={!hydrated} value="billing">
              <Wallet aria-hidden />
              {t("admin_payments")}
            </Tabs.Tab>
            <Tabs.Tab disabled={!hydrated} value="diagnostics">
              <Activity aria-hidden />
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
            <Tabs.Panel value="orders">
              <Suspense
                fallback={
                  <div className="space-y-4" role="status" aria-label={t("common_loading")}>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-48 w-full" />
                  </div>
                }
              >
                <SessionOrders table={table} action={action} orderStatus={orderStatus} />
              </Suspense>
            </Tabs.Panel>
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
              <CouponVisit storeId={storeId} sessionId={table.id} />
              <PaymentForm
                key={table.status}
                storeId={storeId}
                sessionId={table.id}
                closed={table.status === "closed"}
              />
              <PointVisit storeId={storeId} sessionId={table.id} />
            </Tabs.Panel>
            <Tabs.Panel value="diagnostics">
              <dl className="">
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
