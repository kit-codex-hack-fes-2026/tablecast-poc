import type { StatisticsResult } from "@tablecast/api/schema";
import { CircleDollarSign, ReceiptText, Table2, Users } from "lucide-react";
import { Skeleton } from "../../components/ui/skeleton";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";

export function StatisticsSummary({
  summary,
  detailed = false,
}: {
  detailed?: boolean;
  summary?: StatisticsResult["summary"];
}) {
  const { t, locale } = useI18n();
  const number = (value: number) => value.toLocaleString(locale);
  return (
    <>
      <dl className="@container/statistics-summary grid grid-cols-3 gap-5">
        {(
          [
            [
              "paidAmount",
              money(summary?.paidAmount ?? 0, locale),
              CircleDollarSign,
              "text-success bg-success-soft",
            ],
            [
              "sessions",
              number(summary?.sessions ?? 0),
              Table2,
              "text-muted-foreground bg-surface-subtle",
            ],
            [
              "guests",
              number(summary?.guests ?? 0),
              Users,
              "text-muted-foreground bg-surface-subtle",
            ],
            [
              "orders",
              number(summary?.orders ?? 0),
              ReceiptText,
              "text-muted-foreground bg-surface-subtle",
            ],
          ] as const
        ).map(([key, value, Icon, tone]) => (
          <div
            key={key}
            className={`min-w-0 border-b border-border pb-4 ${key === "paidAmount" ? "col-span-3 space-y-2" : "row-span-3 grid grid-rows-subgrid gap-2"}`}
          >
            <dt
              className={`flex items-center gap-2 text-sm text-muted-foreground ${key === "paidAmount" ? "" : "@max-sm/statistics-summary:flex-col @max-sm/statistics-summary:items-start"}`}
            >
              <span
                className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}
              >
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0">{t(`statistics_${key}`)}</span>
            </dt>
            <dd
              className={`${key === "paidAmount" ? "text-4xl" : "text-2xl"} font-semibold tracking-tight tabular-nums wrap-break-word`}
            >
              {summary ? value : <Skeleton className="h-[1em] w-24 max-w-full" />}
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
      {detailed && <StatisticsDetails summary={summary} />}
    </>
  );
}

function StatisticsDetails({ summary }: { summary?: StatisticsResult["summary"] }) {
  const { t, locale } = useI18n();
  const number = (value: number) => value.toLocaleString(locale);
  return (
    <dl className="mt-6 grid gap-x-8 sm:grid-cols-2">
      {(
        [
          ["orderedAmount", money(summary?.orderedAmount ?? 0, locale)],
          ["planSessions", number(summary?.planSessions ?? 0)],
          ["planSessionPaidAmount", money(summary?.planSessionPaidAmount ?? 0, locale)],
          ["positivePayments", money(summary?.positivePayments ?? 0, locale)],
          ["negativePayments", money(summary?.negativePayments ?? 0, locale)],
          ["adjustments", money(summary?.adjustments ?? 0, locale)],
          ["staffCalls", number(summary?.staffCalls ?? 0)],
          ["billCalls", number(summary?.billCalls ?? 0)],
          ["excludedOrders", number(summary?.excludedOrders ?? 0)],
          ["incompleteSnapshots", number(summary?.incompleteSnapshots ?? 0)],
        ] as const
      ).map(([key, value]) => (
        <div
          key={key}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-border/60 py-3"
        >
          <dt className="text-sm text-muted-foreground">{t(`statistics_${key}`)}</dt>
          <dd className="text-right font-medium tabular-nums">
            {summary ? value : <Skeleton className="h-5 w-20" />}
          </dd>
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
  );
}
