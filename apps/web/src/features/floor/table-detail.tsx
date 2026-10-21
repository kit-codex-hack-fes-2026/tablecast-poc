import { type Order, type TableState } from "@tablecast/api/schema";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useHydrated } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  Clock3,
  LayoutDashboard,
  MessagesSquare,
  ReceiptText,
  Table2,
  Users,
  Wallet,
} from "lucide-react";
import { Suspense } from "react";
import { CartLines } from "../../components/cart-lines";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { LanguageLabel } from "../../components/language-label";
import { PageHeader } from "../../components/page-header";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import * as Tabs from "../../components/ui/tabs";
import { money, time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { catalogOptions } from "../catalog/catalog-query";
import { CouponVisit } from "../rewards/coupon-visit";
import { PointVisit } from "../rewards/point-visit";
import { ActivityLog } from "./events";
import { type FloorSearch } from "./floor-model";
import { tableDetailOptions } from "./floor-query";
import { PaymentForm } from "./payment-form";
import { SessionActivity } from "./session-activity";
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

  const { t, locale } = useI18n();
  const route = rpc.api.admin.stores[":storeId"];
  const param = { storeId, id: tableId };
  const detail = useSuspenseQuery(tableDetailOptions(storeId, tableId));
  const client = useQueryClient();
  useRealtime(detail.data.status === "open" ? { storeId } : undefined, detail.data.cursor, () => {
    void client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, tableId] });
    void client.invalidateQueries({ queryKey: ["tablecast-session-events", storeId, tableId] });
  });
  const action = useMutation({
    mutationFn: async (
      operation:
        | { id: string; kind: "order"; status: Exclude<Order["status"], "submitted"> }
        | { kind: "close" }
        | { kind: "resolve" },
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
  function orderStatus(order: Order, status: Exclude<Order["status"], "submitted">) {
    action.mutate({ kind: "order", id: order.id, status });
  }
  const table = detail.data;
  function renderHeader() {
    return (
      <>
        <Button
          nativeButton={false}
          role="link"
          variant="ghost"
          render={
            floorSearch ? (
              <Link to="/admin/stores/$storeId/floor" params={{ storeId }} search={floorSearch} />
            ) : (
              <Link to="/admin/stores/$storeId/visits" params={{ storeId }} />
            )
          }
        >
          <ArrowLeft />
          {t(floorSearch ? "admin_live" : "admin_history")}
        </Button>
        <PageHeader
          title={table.tableName}
          icon={<Table2 />}
          status={
            <Badge variant={table.status === "open" ? "info" : "inactive"}>
              {t(table.status === "open" ? "admin_open" : "admin_closed")}
            </Badge>
          }
          description={
            <>
              <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" aria-hidden="true" />
                  {table.guestCount} {t("admin_guests")}
                </span>
                <LanguageLabel locale={table.locale} />
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-4" aria-hidden="true" />
                  <DateTime value={table.openedAt} />
                </span>
              </span>
            </>
          }
        />
      </>
    );
  }
  return (
    <section className="space-y-5">
      {renderHeader()}
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
                <SessionOrders table={table} pending={action.isPending} orderStatus={orderStatus} />
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
function SessionOrders({
  table,
  pending,
  orderStatus,
}: {
  orderStatus: (order: Order, status: Exclude<Order["status"], "submitted">) => void;
  pending: boolean;
  table: TableState;
}) {
  const { t, locale } = useI18n();
  const catalog = useSuspenseQuery(catalogOptions(table.storeId, table.configVersion));
  const products =
    catalog.data.version === table.configVersion ? catalog.data.configuration.products : [];
  return (
    <>
      <h3 className="mt-5 mx-0 mb-3.5">{t("kiosk_cart")}</h3>
      <CartLines lines={table.cart.lines} products={products} />
      <h3 className="mt-5 mx-0 mb-3.5">{t("kiosk_orders")}</h3>
      {table.orders.map((order) => (
        <article
          key={order.id}
          data-ui="order-card"
          className="border border-border rounded-md m-3.5 overflow-hidden"
        >
          <div className="flex justify-between items-center gap-2 py-3 px-3.5 border-b border-b-border bg-background text-sm">
            <time>{time(order.createdAt, locale)}</time>
            <Badge
              variant={
                order.status === "served"
                  ? "success"
                  : order.status === "cancelled"
                    ? "inactive"
                    : "info"
              }
            >
              {t(`order_${order.status}`)}
            </Badge>
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

                    disabled={pending}
                    onClick={() => orderStatus(order, "accepted")}
                  >
                    {t("admin_accept")}
                  </Button>
                  <Button
                    size="text"
                    variant="link"
                    type="button"
                    className="text-destructive"
                    disabled={pending}
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

                  disabled={pending}
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
                  disabled={pending}
                  onClick={() => orderStatus(order, "cancelled")}
                >
                  {t("admin_cancel_order")}
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
    </>
  );
}
