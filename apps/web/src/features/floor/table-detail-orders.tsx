import type { TableState } from "@tablecast/api/schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock3, Table2, Users } from "lucide-react";
import type { FloorSearch } from "./floor-model";
import type { useTableDetail } from "./table-detail-state";
import { CartLines } from "../../components/cart-lines";
import { DateTime } from "../../components/date-time";
import { LanguageLabel } from "../../components/language-label";
import { PageHeader } from "../../components/page-header";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { money, time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { catalogOptions } from "../catalog/catalog-query";

export function TableDetailHeader({
  table,
  storeId,
  floorSearch,
}: {
  floorSearch?: FloorSearch;
  storeId: string;
  table: TableState;
}) {
  const { t } = useI18n();
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

export function SessionOrders({
  table,
  action,
  orderStatus,
}: {
  action: NonNullable<ReturnType<typeof useTableDetail>["action"]>;
  orderStatus: NonNullable<ReturnType<typeof useTableDetail>["orderStatus"]>;
  table: NonNullable<ReturnType<typeof useTableDetail>["table"]>;
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
    </>
  );
}
