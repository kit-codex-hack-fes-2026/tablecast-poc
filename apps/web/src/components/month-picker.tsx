import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";

/** 月単位の期間選択。value/onChangeはYYYY-MM、表示と操作名はアプリの言語に従う。 */
export function MonthPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { t, locale } = useI18n();
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const [open, setOpen] = useState(false);
  const selected = useRef<HTMLButtonElement>(null);
  const { formatter, monthFormatter, yearFormatter } = useMemo(() => {
    const language = locale === "ja" ? "ja-JP" : "en-GB";
    return {
      formatter: new Intl.DateTimeFormat(language, {
        year: "numeric",
        month: "long",
        timeZone: "UTC",
      }),
      monthFormatter: new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" }),
      yearFormatter: new Intl.DateTimeFormat(language, { year: "numeric", timeZone: "UTC" }),
    };
  }, [locale]);
  const current = new Date(`${value}-01T00:00:00Z`);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(current.getUTCFullYear());
        setOpen(next);
      }}
    >
      <div className="space-y-1 text-sm">
        <p>{label}</p>
        <Popover.Trigger
          render={<Button variant="outline" />}
          aria-label={`${label}: ${formatter.format(current)}`}
        >
          <CalendarDays aria-hidden="true" className="size-4" />
          {formatter.format(current)}
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup
            initialFocus={selected}
            className="w-80 max-w-[var(--available-width)] rounded-xl border border-border bg-card p-4 text-foreground shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("calendar_previous_year")}
                disabled={year <= 1}
                onClick={() => setYear(year - 1)}
              >
                <ChevronLeft />
              </Button>
              <Popover.Title className="font-semibold tabular-nums">
                {yearFormatter.format(new Date(`${String(year).padStart(4, "0")}-01-01T00:00:00Z`))}
              </Popover.Title>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("calendar_next_year")}
                disabled={year >= 9999}
                onClick={() => setYear(year + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, index) => {
                const month = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
                const date = new Date(`${month}-01T00:00:00Z`);
                return (
                  <Button
                    key={month}
                    ref={month === value ? selected : undefined}
                    variant={month === value ? "default" : "ghost"}
                    className="px-1 text-sm"
                    aria-label={formatter.format(date)}
                    aria-pressed={month === value}
                    onClick={() => {
                      onChange(month);
                      setOpen(false);
                    }}
                  >
                    {monthFormatter.format(date)}
                  </Button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
