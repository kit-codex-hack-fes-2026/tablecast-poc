import { useId, useState, type PointerEvent } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import type { Billing } from "./billing-query";

const width = 760;
const height = 180;
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
      <DailyPlot daily={data.daily} values={values} label={label} format={format} charge={charge} />
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
  const id = useId();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const maximum = Math.max(...values.map(Math.abs), 1);
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const ceiling = ([1, 2, 5, 10].find((step) => step * magnitude >= maximum) ?? 10) * magnitude;
  const minimum = values.some((amount) => amount < 0) ? -ceiling : 0;
  const y = (amount: number) => (height * (ceiling - amount)) / (ceiling - minimum);
  const baseline = y(0);
  const dayWidth = width / Math.max(daily.length, 1);
  const index = Math.min(
    selectedDay ??
      Math.max(
        values.findLastIndex((amount) => amount > 0),
        0,
      ),
    Math.max(daily.length - 1, 0),
  );
  const selected = daily[index];
  const select = (next: number) => {
    setSelectedDay(Math.max(0, Math.min(next, daily.length - 1)));
    setInspecting(true);
  };
  const selectPointerDay = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    select(Math.floor(((event.clientX - bounds.left) / bounds.width) * daily.length));
  };
  const selectedLabel = selected
    ? `${formats[locale].date.format(selected.day)} · ${format(values[index] ?? 0)}`
    : t("billing_empty");

  return (
    <figure className="mt-3">
      <figcaption className="mb-2 min-h-6 text-sm tabular-nums">
        {inspecting ? selectedLabel : `${label} (${charge ? "JPY" : t("billing_minutes")})`}
      </figcaption>
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="flex h-44 w-12 shrink-0 flex-col justify-between text-right text-xs text-muted-foreground tabular-nums"
        >
          {[1, 0.75, 0.5, 0.25, 0].map((fraction) => (
            <span key={fraction}>
              {formats[locale].number.format(minimum + (ceiling - minimum) * fraction)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-describedby={`${id}-keyboard`}
            aria-orientation="horizontal"
            aria-valuemin={1}
            aria-valuemax={Math.max(daily.length, 1)}
            aria-valuenow={index + 1}
            aria-valuetext={selectedLabel}
            className="relative rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onFocus={() => setInspecting(true)}
            onBlur={() => setInspecting(false)}
            onPointerLeave={() => setInspecting(false)}
            onPointerMove={selectPointerDay}
            onPointerDown={selectPointerDay}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              select(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? daily.length - 1
                    : index + (event.key === "ArrowRight" ? 1 : -1),
              );
            }}
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="block h-44 w-full overflow-visible"
              aria-hidden="true"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                <line
                  key={fraction}
                  x1="0"
                  x2={width}
                  y1={height * fraction}
                  y2={height * fraction}
                  stroke="currentColor"
                  className="text-border"
                  strokeDasharray={height * fraction === baseline ? undefined : "3 4"}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {values.map((amount, day) => (
                <rect
                  key={daily[day]?.day}
                  x={day * dayWidth + dayWidth * 0.2}
                  y={Math.min(y(amount), baseline)}
                  width={dayWidth * 0.6}
                  height={Math.abs(y(amount) - baseline)}
                  rx="2"
                  className={inspecting && day === index ? "fill-primary" : "fill-primary/60"}
                />
              ))}
              {inspecting && selected && (
                <line
                  x1={(index + 0.5) * dayWidth}
                  x2={(index + 0.5) * dayWidth}
                  y1="0"
                  y2={height}
                  stroke="currentColor"
                  className="text-primary/35"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          </div>
          <div
            aria-hidden="true"
            className="mt-2 grid text-center text-xs text-muted-foreground tabular-nums"
            style={{
              gridTemplateColumns: `repeat(${Math.max(daily.length, 1)}, minmax(0, 1fr))`,
            }}
          >
            {daily.map((row, day) => (
              <span key={row.day}>
                {day === 0 || day === daily.length - 1 || (day + 1) % 7 === 0
                  ? new Date(row.day).getUTCDate()
                  : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p id={`${id}-keyboard`} className="sr-only">
        {t("billing_daily_keyboard")}
      </p>
    </figure>
  );
}
