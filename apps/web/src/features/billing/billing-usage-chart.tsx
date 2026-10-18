import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useId, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import type { Billing } from "./billing-query";

const formats = {
  ja: {
    number: new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }),
    currency: new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 2,
    }),
    date: new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", timeZone: "UTC" }),
  },
  en: {
    number: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }),
    currency: new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 2,
    }),
    date: new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", timeZone: "UTC" }),
  },
};
function formatValue(amount: number, charge: boolean, locale: "ja" | "en", minutes: string) {
  if (!charge) return `${formats[locale].number.format(amount)} ${minutes}`;
  const belowPrecision = Math.abs(amount) > 0 && Math.abs(amount) < 0.01;
  const prefix = belowPrecision ? (amount < 0 ? "> " : "< ") : "";
  const displayed = belowPrecision ? Math.sign(amount) * 0.01 : amount;
  return `${prefix}${formats[locale].currency.format(displayed).replace("￥", "¥")}`;
}

export function BillingUsageChart({ data }: { data: Billing }) {
  const { t, locale } = useI18n();
  const id = useId();
  const [metric, setMetric] = useState<"voice" | "charge">("voice");
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
              {t("billing_voice")}
            </Button>
            <Button
              size="sm"
              variant={charge ? "secondary" : "ghost"}
              aria-pressed={charge}
              onClick={() => setMetric("charge")}
            >
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
      <details className="mt-4 border-t border-border pt-3">
        <summary className="w-fit cursor-pointer rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("billing_daily_table")}
        </summary>
        <table className="mt-3 w-full text-sm tabular-nums">
          <caption className="sr-only">
            {t("billing_daily_title")} · {label}
          </caption>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-2 text-left font-medium">
                {t("billing_daily_day")}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {label}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.daily.map((row, day) => (
              <tr key={row.day} className="border-b border-border/50 last:border-0">
                <th scope="row" className="py-2 text-left font-normal">
                  {formats[locale].date.format(row.day)}
                </th>
                <td className="py-2 text-right">{format(values[day] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function DailyPlot({
  daily,
  values,
  label,
  format,
  charge,
}: {
  daily: Billing["daily"];
  values: number[];
  label: string;
  format: (amount: number) => string;
  charge: boolean;
}) {
  const { t, locale } = useI18n();
  const [focused, setFocused] = useState<string | null>(null);
  const definition = useMemo(() => {
    const rows = daily.map((row, index) => ({
      day: formats[locale].date.format(row.day),
      amount: values[index] ?? 0,
      tick:
        index === 0 || index === daily.length - 1 || (index + 1) % 7 === 0
          ? String(new Date(row.day).getUTCDate())
          : "",
    }));
    return defineChart({
      marks: [barY(rows, { x: "day", y: "amount", fill: "var(--color-primary)" })],
      scales: {
        x: {
          scale: () => scaleBand().padding(0.25),
          axis: {
            ticks: {
              format: (value) => rows.find((row) => row.day === value)?.tick ?? "",
            },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            ticks: { format: (value) => formats[locale].number.format(value) },
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
    </figure>
  );
}
