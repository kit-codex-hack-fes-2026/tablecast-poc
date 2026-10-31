import { resolveLocalized } from "@tablecast/api/localization";
import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { AudioLines, CalendarDays, Coins, TableProperties } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { useCollectionSearch } from "../shell/collection-search";
import type { Billing } from "./billing-query";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { Button } from "../../components/ui/button";
import * as Disclosure from "../../components/ui/disclosure";
import { calendarDate } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";

const formats = {
  ja: {
    number: new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }),
    currency: new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 2,
    }),
  },
  en: {
    number: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }),
    currency: new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 2,
    }),
  },
};
function formatValue(amount: number, charge: boolean, locale: string, minutes: string) {
  if (!charge) return `${resolveLocalized(formats, locale).number.format(amount)} ${minutes}`;
  const belowPrecision = Math.abs(amount) > 0 && Math.abs(amount) < 0.01;
  const prefix = belowPrecision ? (amount < 0 ? "> " : "< ") : "";
  const displayed = belowPrecision ? Math.sign(amount) * 0.01 : amount;
  return `${prefix}${resolveLocalized(formats, locale).currency.format(displayed).replace("￥", "¥")}`;
}

export function BillingUsageChart({
  data,
  collection,
}: {
  collection?: ReturnType<typeof useCollectionSearch>;
  data: Billing;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const [metric, setMetric] = useState<"charge" | "voice">("voice");
  const charges = data.daily.flatMap((row) => ("chargeMicros" in row ? [row.chargeMicros] : []));
  const canViewCharge =
    data.canManage && data.financial !== null && charges.length === data.daily.length;
  const charge = metric === "charge" && canViewCharge;
  const label = charge ? t("billing_daily_charge") : t("billing_voice");
  const format = (amount: number) => formatValue(amount, charge, locale, t("billing_minutes"));
  const values = charge
    ? charges.map((amount) => amount / 1e6)
    : data.daily.map((row) => row.seconds / 60);
  const total = charge
    ? charges.reduce((sum, amount) => sum + amount, 0) / 1e6
    : data.daily.reduce((sum, row) => sum + row.seconds, 0) / 60;

  return (
    <section
      className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id={`${id}-title`} className="font-semibold">
            {t("billing_daily_title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("billing_daily_hint")}</p>
        </div>
        {canViewCharge && (
          <div
            role="group"
            aria-label={t("billing_daily_title")}
            className="flex max-w-full flex-wrap rounded-lg border border-border p-1"
          >
            <Button
              size="sm"
              variant={!charge ? "secondary" : "ghost"}
              aria-pressed={!charge}
              onClick={() => setMetric("voice")}
            >
              <AudioLines />
              {t("billing_voice")}
            </Button>
            <Button
              size="sm"
              variant={charge ? "secondary" : "ghost"}
              aria-pressed={charge}
              onClick={() => setMetric("charge")}
            >
              <Coins />
              {t("billing_daily_charge")}
            </Button>
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {label} · {t("billing_daily_total")}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{format(total)}</p>
      </div>
      <DailyPlot
        key={String(charge)}
        daily={data.daily}
        values={values}
        label={label}
        format={format}
        charge={charge}
      />
      {!values.some((amount) => amount !== 0) && (
        <p className="mt-2 text-sm text-muted-foreground">{t("billing_empty")}</p>
      )}
      {charge && (
        <p className="mt-2 text-sm text-muted-foreground">{t("billing_daily_charge_hint")}</p>
      )}
      <Disclosure.Root className="mt-4 border-t border-border pt-3">
        <Disclosure.Trigger className="w-fit cursor-pointer rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <TableProperties className="mr-2 inline size-4" />
          {t("billing_daily_table")}
        </Disclosure.Trigger>
        <Disclosure.Panel>
          <div className="mt-3">
            <DailyTable
              data={data.daily.map((row, day) => ({ day: row.day, amount: values[day] ?? 0 }))}
              label={label}
              charge={charge}
              format={format}
              collection={collection}
            />
          </div>
        </Disclosure.Panel>
      </Disclosure.Root>
    </section>
  );
}

function DailyTable({
  data,
  label,
  charge,
  format,
  collection,
}: {
  charge: boolean;
  collection?: ReturnType<typeof useCollectionSearch>;
  data: { amount: number; day: number }[];
  format: (amount: number) => string;
  label: string;
}) {
  const { t, locale } = useI18n();
  const columns: DataTableColumn<{ amount: number; day: number }>[] = [
    {
      accessorKey: "day",
      header: t("billing_daily_day"),
      meta: { icon: CalendarDays, rowHeader: true },
      cell: ({ row }) => calendarDate(row.original.day, locale),
    },
    {
      accessorKey: "amount",
      header: label,
      meta: { align: "right", icon: charge ? Coins : AudioLines },
      cell: ({ row }) => format(row.original.amount),
    },
  ];
  return (
    <DataTable
      defaultSort={{ id: "day", desc: false }}
      {...collection}
      data={data}
      columns={columns}
      getRowId={(row) => String(row.day)}
      pagination={false}
      tableLabel={`${t("billing_daily_title")} · ${label}`}
    />
  );
}

function DailyPlot({
  daily,
  values,
  label,
  format,
  charge,
}: {
  charge: boolean;
  daily: Billing["daily"];
  format: (amount: number) => string;
  label: string;
  values: number[];
}) {
  const { t, locale } = useI18n();
  const [focused, setFocused] = useState<null | string>(null);
  const definition = useMemo(() => {
    const rows = daily.map((row, index) => ({
      day: calendarDate(row.day, locale),
      amount: values[index] ?? 0,
    }));
    return defineChart({
      marks: [barY(rows, { x: "day", y: "amount", fill: "var(--color-primary)" })],
      scales: {
        x: {
          scale: () => scaleBand().padding(0.25),
          axis: {
            ticks: {
              format: () => "",
            },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            ticks: { format: (value) => resolveLocalized(formats, locale).number.format(value) },
          },
        },
      },
      svgAnimation: false,
      tooltip: {
        use: tooltip,
        format: (point) => `${point.datum.day} · ${format(point.datum.amount)}`,
      },
    });
  }, [daily, values, locale, format]);
  return (
    <figure className="mt-3">
      <figcaption className="mb-2 min-h-6 text-sm tabular-nums">
        {focused ?? `${label} (${charge ? "JPY" : t("billing_minutes")})`}
      </figcaption>
      <Chart
        definition={definition}
        height={220}
        ariaLabel={label}
        ariaDescription={t("billing_daily_keyboard")}
        onFocusChange={(point) =>
          setFocused(point ? `${point.datum.day} · ${format(point.datum.amount)}` : null)
        }
        className="[&_svg:focus-visible]:outline-2 [&_svg:focus-visible]:outline-ring [&_svg:focus-visible]:outline-offset-2"
      />
      {daily.length > 0 && (
        <p className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{calendarDate(daily.at(0)?.day ?? "", locale)}</span>
          <span>
            {locale === "ja" ? "から" : "to"} {calendarDate(daily.at(-1)?.day ?? "", locale)}
          </span>
        </p>
      )}
    </figure>
  );
}
