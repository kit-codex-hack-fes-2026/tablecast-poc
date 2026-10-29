import { ArrowDownUp, ArrowDownWideNarrow, ArrowUpNarrowWide, type LucideIcon } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { CollectionSelect } from "./collection-select";

/** 対象と方向を独立して選び、URLと並び順は各一覧で所有する。 */
export function CollectionSort({
  options,
  value,
  descending,
  onValueChange,
  onDescendingChange,
  disabled,
  directionDisabled = false,
}: {
  descending: boolean;
  directionDisabled?: boolean;
  disabled?: boolean;
  onDescendingChange: (descending: boolean) => void;
  onValueChange: (value: string) => void;
  options: { icon: LucideIcon; label: string; value: string }[];
  value: string;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3">
      <div className="flex min-w-0 flex-col gap-2 text-sm font-medium">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <ArrowDownUp aria-hidden className="size-4 shrink-0" />
          {t("collection_sort_field")}
        </span>
        <CollectionSelect
          label={t("collection_sort_field")}
          options={options}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2 text-sm font-medium">
        <span className="flex items-center gap-2 whitespace-nowrap">
          {t("collection_sort_direction")}
        </span>
        <CollectionSelect
          label={t("collection_sort_direction")}
          options={[
            { value: "asc", label: t("collection_sort_ascending"), icon: ArrowUpNarrowWide },
            { value: "desc", label: t("collection_sort_descending"), icon: ArrowDownWideNarrow },
          ]}
          value={descending ? "desc" : "asc"}
          onValueChange={(next) => onDescendingChange(next === "desc")}
          disabled={disabled || directionDisabled}
        />
      </div>
    </div>
  );
}
