import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useImperativeHandle,
  useLayoutEffect,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { storeTimeZone } from "@tablecast/api/schema";
import { useI18n } from "../i18n/locale";
import {
  calendarInputValue,
  calendarKeyDate,
  parseCalendarInput,
  shiftCalendarDate,
} from "../lib/calendar-input";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export type DatePickerProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max"
> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
};

/** 保存値はISO、表示は言語に沿う自然日付。直接入力とカレンダーで同じ値を編集する。 */
function useCalendarField({ value, onValueChange, min, max, ref, ...props }: DatePickerProps) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(() => ({
    source: value,
    pending: value,
    locale,
    text: calendarInputValue(value, locale),
  }));
  if (value !== editing.source) {
    setEditing({
      source: value,
      pending: value,
      locale,
      text:
        value === editing.pending && locale === editing.locale
          ? editing.text
          : calendarInputValue(value, locale),
    });
  } else if (locale !== editing.locale) {
    const completed = parseCalendarInput(editing.text, editing.locale);
    setEditing({
      ...editing,
      locale,
      text: completed ? calendarInputValue(completed, locale) : editing.text,
    });
  }
  const draft = editing.text;
  const [open, setOpen] = useState(false);
  const [showError, setShowError] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const errorId = useId();
  const parsed = parseCalendarInput(draft, locale);
  const missing = !draft.trim();
  let error = "";
  if ((!missing && !parsed) || (missing && props.required)) error = t("calendar_invalid_date");
  else if (parsed && ((min && parsed < min) || (max && parsed > max)))
    error = t("calendar_date_range");
  useEffect(() => {
    input.current?.setCustomValidity(error);
  }, [error]);
  useImperativeHandle(ref, () => {
    const element = input.current;
    if (!element) throw new Error("日付入力がマウントされていません");
    return element;
  }, []);
  function change(next: string) {
    const canonical = parseCalendarInput(next, locale) ?? "";
    setEditing({ source: value, pending: canonical, locale, text: next });
    onValueChange(canonical);
  }
  function finishEdit() {
    if (parsed)
      setEditing({
        source: value,
        pending: parsed,
        locale,
        text: calendarInputValue(parsed, locale),
      });
  }
  function select(next: string) {
    setEditing({ source: value, pending: next, locale, text: calendarInputValue(next, locale) });
    onValueChange(next);
    setShowError(false);
    setOpen(false);
  }
  return {
    t,
    draft,
    open,
    setOpen,
    showError,
    setShowError,
    input,
    errorId,
    error,
    change,
    finishEdit,
    select,
  };
}

export function DatePicker({
  value,
  onValueChange,
  label,
  min,
  max,
  ref,
  onBlur,
  onInvalid,
  ...props
}: DatePickerProps) {
  const {
    t,
    draft,
    open,
    setOpen,
    showError,
    setShowError,
    input,
    errorId,
    error,
    change,
    finishEdit,
    select,
  } = useCalendarField({ value, onValueChange, label, min, max, ref, ...props });
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Input
            {...props}
            ref={input}
            type="text"
            aria-label={label}
            aria-describedby={
              [props["aria-describedby"], showError && error ? errorId : undefined]
                .filter(Boolean)
                .join(" ") || undefined
            }
            aria-invalid={props["aria-invalid"] || (showError && Boolean(error))}
            value={draft}
            onChange={(event) => change(event.target.value)}
            onBlur={(event) => {
              finishEdit();
              onBlur?.(event);
            }}
            onInvalid={(event) => {
              setShowError(true);
              onInvalid?.(event);
            }}
          />
          <Popover.Trigger
            render={<Button variant="outline" size="icon" />}
            disabled={props.disabled || props.readOnly}
            aria-label={`${label}: ${t("calendar_open")}`}
          >
            <CalendarDays aria-hidden="true" />
          </Popover.Trigger>
        </div>
        {showError && error && (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={8} className="z-50">
          <CalendarPanel value={value} min={min} max={max} onSelect={select} finalFocus={input} />
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

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

function CalendarPanel({
  value,
  min,
  max,
  onSelect,
  finalFocus,
}: Pick<DatePickerProps, "value" | "min" | "max"> & {
  onSelect: (value: string) => void;
  finalFocus: React.RefObject<HTMLInputElement | null>;
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
      initialFocus={selected}
      finalFocus={finalFocus}
      className="w-88 max-w-[var(--available-width)] rounded-2xl border border-border bg-card p-3 text-foreground shadow-lg"
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
