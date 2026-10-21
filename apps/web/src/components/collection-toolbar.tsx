import { ArrowDownUp, ListFilter, RotateCcw, Search } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** 検索・条件・並べ替えを同じ場所へまとめる。値とリセット範囲は各一覧が所有する。 */
export function CollectionToolbar({
  search,
  filters,
  sort,
  onReset,
  resetDisabled,
  disabled = false,
}: {
  disabled?: boolean;
  filters?: ReactNode;
  onReset: () => void;
  resetDisabled: boolean;
  search?: {
    label: string;
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
  };
  sort?: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-2xl bg-surface-subtle p-4">
      {search && (
        <label
          className="flex min-w-0 basis-60 grow flex-col gap-2 text-sm font-medium"
          htmlFor={`${id}-search`}
        >
          <span className="flex items-center gap-2">
            <Search aria-hidden className="size-4 shrink-0" />
            {search.label}
          </span>
          <Input
            id={`${id}-search`}
            type="search"
            disabled={disabled}
            value={search.value}
            placeholder={search.placeholder ?? search.label}
            onChange={(event) => search.onChange(event.target.value)}
          />
        </label>
      )}
      {filters && (
        <fieldset disabled={disabled} className="min-w-0 basis-40 grow sm:basis-96">
          <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ListFilter aria-hidden className="size-4 shrink-0" />
            {t("collection_filters")}
          </legend>
          {filters}
        </fieldset>
      )}
      {sort && (
        <fieldset disabled={disabled} className="min-w-0 basis-40 grow sm:basis-48">
          <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ArrowDownUp aria-hidden className="size-4 shrink-0" />
            {t("collection_sort")}
          </legend>
          <div className="grid">{sort}</div>
        </fieldset>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || resetDisabled}
        onClick={onReset}
      >
        <RotateCcw aria-hidden />
        {t("collection_reset")}
      </Button>
    </div>
  );
}
