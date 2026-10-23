import { Field } from "@base-ui/react/field";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n/locale";
import { validClock } from "../lib/calendar-input";
import { DatePicker, type DatePickerProps } from "./date-picker";
import { Input } from "./ui/input";
export function DateTimePicker({ value, onValueChange, min, max, ...props }: DatePickerProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => ({
    source: value,
    date: value.slice(0, 10),
    clock: value.slice(11, 16),
  }));
  if (value !== draft.source)
    setDraft({ source: value, date: value.slice(0, 10), clock: value.slice(11, 16) });
  const { date, clock } = draft;
  const clockInput = useRef<HTMLInputElement>(null);
  const clockId = useId();
  const combined = date && validClock(clock) ? `${date}T${clock}` : "";
  let clockError = "";
  if ((clock && !validClock(clock)) || (!clock && props.required))
    clockError = t("calendar_invalid_time");
  else if (combined && ((min && combined < min) || (max && combined > max)))
    clockError = t("calendar_date_range");
  useEffect(() => {
    clockInput.current?.setCustomValidity(clockError);
  }, [clockError]);
  const [showError, setShowError] = useState(false);
  function update(nextDate: string, nextClock: string) {
    const next = nextDate && validClock(nextClock) ? `${nextDate}T${nextClock}` : "";
    setDraft({ source: next, date: nextDate, clock: nextClock });
    onValueChange(next);
  }
  function renderInput() {
    return (
      <div className="grid min-w-0 gap-3">
        <DatePicker
          {...props}
          value={date}
          min={min?.slice(0, 10)}
          max={max?.slice(0, 10)}
          onValueChange={(next) => update(next, clock)}
        />
        <Field.Root className="flex items-center gap-3">
          <Field.Label htmlFor={clockId} className="text-sm text-muted-foreground">
            <span className="sr-only">{props.label}: </span>
            {t("calendar_time")}
          </Field.Label>
          <Input
            id={clockId}
            ref={clockInput}
            className="w-28 tabular-nums"
            type="text"
            value={clock}
            aria-label={`${props.label}: ${t("calendar_time")}`}
            required={props.required}
            disabled={props.disabled}
            readOnly={props.readOnly}
            aria-invalid={showError && Boolean(clockError)}
            aria-describedby={showError && clockError ? `${clockId}-error` : undefined}
            onChange={(event) => update(date, event.target.value)}
            onBlur={props.onBlur}
            onInvalid={() => setShowError(true)}
          />
        </Field.Root>
        {showError && clockError && (
          <p id={`${clockId}-error`} className="text-sm text-destructive">
            {clockError}
          </p>
        )}
      </div>
    );
  }
  return renderInput();
}
