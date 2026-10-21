import type { TableState } from "@tablecast/api/schema";
import { Check } from "lucide-react";
import type { useTableSession } from "./kiosk-session";
import { CartLines } from "../../components/cart-lines";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import * as Tabs from "../../components/ui/tabs";
import { money, time } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { type TableEndpoint } from "../../lib/api";
import { CustomerOrderAttribution } from "./customer-order-attribution";

export function KioskPlanSummary({ plan }: { plan: TableState["plan"] }) {
  const { t, locale } = useI18n();
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

export function KioskOrders({
  data,
  catalog,
  endpoint,
}: {
  catalog: ReturnType<typeof useTableSession>["catalog"];
  data: TableState;
  endpoint: TableEndpoint;
}) {
  const { t, locale } = useI18n();
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

export function KioskBilling({
  data,
  call,
}: {
  call: NonNullable<ReturnType<typeof useTableSession>["call"]>;
  data: TableState;
}) {
  const { t, locale } = useI18n();
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
            <dd>{money(data.bill.orderedTotal, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("kiosk_plan_charge")}</dt>
            <dd>{money(data.bill.planTotal, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("kiosk_adjustment")}</dt>
            <dd>{money(data.bill.adjustmentTotal, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("kiosk_paid")}</dt>
            <dd>{money(data.bill.paidTotal, locale)}</dd>
          </div>
          <div data-ui="bill-total" className="">
            <dt className="text-muted-foreground">{t("kiosk_due")}</dt>
            <dd>{money(data.bill.due, locale)}</dd>
          </div>
        </dl>
        <p className="text-muted-foreground text-xs mt-2.5">
          {t("kiosk_not_sent")}: {money(data.bill.cartTotal, locale)}
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
