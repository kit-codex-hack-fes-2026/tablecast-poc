import type { LucideIcon } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

/** 一覧条件の対象をアイコンと名前で選ぶ。値とURLの所有者は各feature。 */
export function CollectionSort({
  options,
  value,
  onValueChange,
  disabled,
  label,
}: {
  options: { value: string; label: string; icon: LucideIcon }[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { t } = useI18n();
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <Select
      value={selected?.value ?? ""}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label ?? t("collection_sort")}>
        {selected && (
          <span className="flex min-w-0 items-center gap-2 text-left">
            <selected.icon aria-hidden className="size-4 shrink-0" />
            <span>{selected.label}</span>
          </span>
        )}
      </SelectTrigger>
      <SelectContent className="max-w-[calc(100vw-2rem)]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <option.icon aria-hidden className="size-4 shrink-0" />
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
