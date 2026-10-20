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
      <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
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
            ["orders", number(summary.orders), ReceiptText, "text-warning bg-warning-soft"],
          ] as const
        ).map(([key, value, Icon, tone]) => (
          <div key={key} className="min-w-0 space-y-2 border-b border-border pb-4">
            <dt className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span
                className={`inline-flex size-9 items-center justify-center rounded-full ${tone}`}
              >
                <Icon aria-hidden="true" className="size-5" />
              </span>
              {t(`statistics_${key}`)}
            </dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums wrap-break-word">
              {value}
            </dd>
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
              className="flex items-baseline justify-between gap-4 border-b border-border/60 py-3"
            >
              <dt className="text-sm text-muted-foreground">{t(`statistics_${key}`)}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
