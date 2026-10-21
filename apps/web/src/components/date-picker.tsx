import { Popover } from "@base-ui/react/popover";
import { CalendarDays } from "lucide-react";
import {
  type ComponentProps,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { calendarInputValue, parseCalendarInput } from "../lib/calendar-input";
import { CalendarPanel } from "./calendar-panel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export type DatePickerProps = Omit<
  ComponentProps<typeof Input>,
  "defaultValue" | "max" | "min" | "onChange" | "type" | "value"
> & {
  label: string;
  max?: string;
  min?: string;
  onValueChange: (value: string) => void;
  value: string;
};
export function DatePicker({
  value,
  onValueChange,
  label,
  min,
  max,
  ref,
  onBlur,
  onInvalid,
  className,
  ...props
}: DatePickerProps) {
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
  function renderInput() {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
            <Input
              {...props}
              className={cn("flex-1 basis-72 px-2", className)}
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
              render={<Button variant="outline" size="icon-sm" />}
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
  return renderInput();
}
