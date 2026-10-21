import { Popover } from "@base-ui/react/popover";
import { storeTimeZone } from "@tablecast/api/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { cn } from "tailwind-variants";
import type { DatePickerProps } from "./date-picker";
import { useI18n } from "../i18n/locale";
import {
  calendarInputValue,
  calendarKeyDate,
  parseCalendarInput,
  shiftCalendarDate,
} from "../lib/calendar-input";
import { Button } from "./ui/button";
import { surfaceMotion } from "./ui/motion-variants";

const todayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: storeTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const monthFormats = {
  ja: new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", timeZone: "UTC" }),
};

const weekdayFormats = {
  ja: new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }),
};

export function CalendarPanel({
  value,
  min,
  max,
  onSelect,
  finalFocus,
}: Pick<DatePickerProps, "max" | "min" | "value"> & {
  finalFocus: React.RefObject<HTMLInputElement | null>;
  onSelect: (value: string) => void;
}) {
  const { t, locale } = useI18n();
  const [today] = useState(() => todayFormat.format(new Date()));
  const initial = value || today;
  const [focused, setFocused] = useState(
    min && initial < min ? min : max && initial > max ? max : initial,
  );
  const [month, setMonth] = useState(() => focused.slice(0, 7));
  const selected = useRef<HTMLButtonElement | null>(null);
  const keyboardFocus = useRef(false);
  useLayoutEffect(() => {
    if (!keyboardFocus.current) return;
    keyboardFocus.current = false;
    selected.current?.focus();
  });
  const monthFormat = monthFormats[locale];
  const weekdayFormat = weekdayFormats[locale];
  const start = `${month}-01`;
  const first = shiftCalendarDate(start, -new Date(`${start}T00:00:00Z`).getUTCDay());
  const days = Array.from({ length: 42 }, (_, index) => shiftCalendarDate(first, index));
  function allowed(date: string) {
    return (
      Boolean(parseCalendarInput(date, "en")) && (!min || date >= min) && (!max || date <= max)
    );
  }
  function changeMonth(offset: number) {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    const next = date.toISOString().slice(0, 7);
    setMonth(next);
    const firstDay = `${next}-01`;
    setFocused(min && firstDay < min ? min : firstDay);
  }
  function keydown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const next = calendarKeyDate(date, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    if (!allowed(next)) return;
    keyboardFocus.current = true;
    setFocused(next);
    setMonth(next.slice(0, 7));
  }
  return (
    <Popover.Popup
      render={(renderProps, state) => (
        <div {...renderProps} inert={!state.open} aria-hidden={!state.open || undefined} />
      )}
      initialFocus={selected}
      finalFocus={finalFocus}
      className={cn(
        "w-88 max-w-[var(--available-width)] rounded-2xl border border-border bg-card p-3 text-foreground shadow-lg",
        surfaceMotion(),
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("calendar_previous_month")}
          disabled={month === "0001-01" || Boolean(min && month <= min.slice(0, 7))}
          onClick={() => changeMonth(-1)}
        >
          <ChevronLeft />
        </Button>
        <Popover.Title className="font-semibold tabular-nums">
          {monthFormat.format(new Date(`${start}T00:00:00Z`))}
        </Popover.Title>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("calendar_next_month")}
          disabled={month === "9999-12" || Boolean(max && month >= max.slice(0, 7))}
          onClick={() => changeMonth(1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <div
        className="grid grid-cols-7 text-center text-xs text-muted-foreground"
        aria-hidden="true"
      >
        {days.slice(0, 7).map((date) => (
          <span key={date} className="py-2">
            {weekdayFormat.format(new Date(`${date}T00:00:00Z`))}
          </span>
        ))}
      </div>
      <div
        className="grid grid-cols-7"
        role="group"
        aria-label={monthFormat.format(new Date(`${start}T00:00:00Z`))}
      >
        {days.map((date) =>
          parseCalendarInput(date, "en") ? (
            <Button
              key={date}
              ref={date === focused ? selected : undefined}
              variant={date === value ? "default" : "ghost"}
              className={`h-11 min-w-0 w-full p-0 text-sm ${date.slice(0, 7) === month ? "" : "text-muted-foreground"}`}
              tabIndex={date === focused ? 0 : -1}
              aria-label={calendarInputValue(date, locale)}
              aria-pressed={date === value}
              aria-current={date === today ? "date" : undefined}
              disabled={!allowed(date)}
              onKeyDown={(event) => keydown(event, date)}
              onClick={() => onSelect(date)}
            >
              {Number(date.slice(8, 10))}
            </Button>
          ) : (
            <span key={date} aria-hidden="true" />
          ),
        )}
      </div>
      <div className="mt-2 flex justify-between border-t border-border pt-2">
        <Button variant="ghost" disabled={!allowed(today)} onClick={() => onSelect(today)}>
          {t("calendar_today")}
        </Button>
        <Button variant="ghost" disabled={!value} onClick={() => onSelect("")}>
          {t("calendar_clear")}
        </Button>
      </div>
    </Popover.Popup>
  );
}
