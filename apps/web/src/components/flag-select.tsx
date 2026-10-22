import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

type Option<Value extends string> = {
  description?: string;
  flag: string;
  label: string;
  menuLabel?: string;
  value: Value;
};
function label(option: Option<string>, details = false) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img
        src={option.flag}
        alt=""
        aria-hidden="true"
        width={18}
        height={14}
        className="h-3.5 w-4.5 shrink-0 rounded-xs object-contain"
      />
      <span className="flex flex-col text-left">
        <span>{details ? (option.menuLabel ?? option.label) : option.label}</span>
        {details && option.description && (
          <span className="mt-0.5 text-xs text-muted-foreground">{option.description}</span>
        )}
      </span>
    </span>
  );
}
/** 言語・通貨で共通の選択操作。値と保存方法は呼出し側が所有する。 */
export function FlagSelect<Value extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  note,
  footer,
}: {
  ariaLabel: string;
  disabled?: boolean;
  footer?: ReactNode;
  note?: ReactNode;
  onChange: (value: Value) => void;
  options: readonly Option<Value>[];
  value: Value;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) onChange(option.value);
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="min-h-14 w-auto shrink-0 gap-2 rounded-lg text-sm"
      >
        {selected && label(selected)}
      </SelectTrigger>
      <SelectContent className="max-h-[min(32rem,75dvh)] max-w-[calc(100vw-2rem)]">
        {note && (
          <p role="note" className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {note}
          </p>
        )}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="min-h-14">
            {label(option, true)}
          </SelectItem>
        ))}
        {footer && (
          <p role="note" className="px-3 py-2 text-xs text-muted-foreground">
            {footer}
          </p>
        )}
      </SelectContent>
    </Select>
  );
}
