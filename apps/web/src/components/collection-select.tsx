import type { LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

/** 一覧条件の対象をアイコンと名前で選ぶ。値とURLの所有者は各feature。 */
export function CollectionSelect({
  options,
  value,
  onValueChange,
  disabled,
  label,
}: {
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  options: { icon: LucideIcon; label: string; value: string }[];
  value: string;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <Select
      value={selected?.value ?? ""}
      items={options}
      onValueChange={(next, details) => {
        // 候補の差替えによる内部同期で一覧条件とURLを上書きしない。
        if (next !== null && details.reason !== "none") onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="whitespace-nowrap px-2 text-sm">
        {selected && (
          <span className="flex min-w-0 items-center gap-2 text-left" title={selected.label}>
            <selected.icon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{selected.label}</span>
          </span>
        )}
      </SelectTrigger>
      <SelectContent className="max-w-[calc(100vw-2rem)]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <option.icon aria-hidden className="size-4 shrink-0" />
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
