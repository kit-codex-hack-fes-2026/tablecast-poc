import { CircleDollarSign, Users, ReceiptText, Table2 } from "lucide-react";
import type { StatisticsResult } from "@tablecast/api/schema";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";

export function StatisticsSummary({
  summary,
  detailed = false,
}: {
  summary: StatisticsResult["summary"];
  detailed?: boolean;
}) {
  const { t, locale } = useI18n();
  const number = (value: number) => value.toLocaleString(locale);
  return (
    <>
      <dl className="grid grid-cols-3 gap-5">
        {(
          [
            [
              "paidAmount",
              money(summary.paidAmount, locale),
              CircleDollarSign,
              "text-success bg-success-soft",
            ],
            ["sessions", number(summary.sessions), Table2, "text-info bg-info-soft"],
            ["guests", number(summary.guests), Users, "text-info bg-info-soft"],
            ["orders", number(summary.orders), ReceiptText, "text-info bg-info-soft"],
          ] as const
        ).map(([key, value, Icon, tone]) => (
          <div
            key={key}
            className={`min-w-0 border-b border-border pb-4 ${key === "paidAmount" ? "col-span-3 space-y-2" : "row-span-3 grid grid-rows-subgrid gap-2"}`}
          >
            <dt className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className={`inline-flex size-9 items-center justify-center rounded-lg ${tone}`}>
                <Icon aria-hidden="true" className="size-5" />
              </span>
              {t(`statistics_${key}`)}
            </dt>
            <dd
              className={`${key === "paidAmount" ? "text-4xl" : "text-2xl"} font-semibold tracking-tight tabular-nums wrap-break-word`}
            >
              {value}
            </dd>
            {key === "paidAmount" && (
              <dd className="text-xs text-muted-foreground">{t("statistics_money_basis")}</dd>
            )}
            {key === "orders" && (
              <dd className="text-xs text-muted-foreground">{t("statistics_order_hint")}</dd>
            )}
          </div>
        ))}
      </dl>
      {detailed && (
        <dl className="mt-6 grid gap-x-8 sm:grid-cols-2">
          {(
            [
              ["orderedAmount", money(summary.orderedAmount, locale)],
              ["planSessions", number(summary.planSessions)],
              ["planSessionPaidAmount", money(summary.planSessionPaidAmount, locale)],
              ["positivePayments", money(summary.positivePayments, locale)],
              ["negativePayments", money(summary.negativePayments, locale)],
              ["adjustments", money(summary.adjustments, locale)],
              ["staffCalls", number(summary.staffCalls)],
              ["billCalls", number(summary.billCalls)],
              ["excludedOrders", number(summary.excludedOrders)],
              ["incompleteSnapshots", number(summary.incompleteSnapshots)],
            ] as const
          ).map(([key, value]) => (
            <div
              key={key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-border/60 py-3"
            >
              <dt className="text-sm text-muted-foreground">{t(`statistics_${key}`)}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
              {key === "negativePayments" && (
                <dd className="col-span-2 text-xs text-muted-foreground">
                  {t("statistics_negative_hint")}
                </dd>
              )}
              {key === "planSessionPaidAmount" && (
                <dd className="col-span-2 text-xs text-muted-foreground">
                  {t("statistics_plan_basis")}
                </dd>
              )}
              {(key === "staffCalls" || key === "billCalls") && (
                <dd className="col-span-2 text-xs text-muted-foreground">
                  {t("statistics_calls_hint")}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
