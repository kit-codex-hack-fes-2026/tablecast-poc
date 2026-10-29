import { RotateCcw, Search } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** 検索とリセット、各条件を分け、利用できる幅で条件の列数を切り替える。 */
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
  const criteria = (
    <div
      className={`grid min-w-0 gap-4 ${filters && sort ? "@3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : ""}`}
    >
      {filters && (
        <fieldset disabled={disabled} className="min-w-0">
          <legend className="sr-only">{t("collection_filters")}</legend>
          {filters}
        </fieldset>
      )}
      {sort && (
        <fieldset disabled={disabled} className={`min-w-0 ${filters ? "" : "max-w-xl"}`}>
          <legend className="sr-only">{t("collection_sort")}</legend>
          {sort}
        </fieldset>
      )}
    </div>
  );
  return (
    <div className="@container space-y-4 rounded-2xl bg-surface-subtle p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        {search ? (
          <label
            className="flex min-w-0 flex-col gap-2 text-sm font-medium"
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
        ) : (
          criteria
        )}
        <Button
          type="button"
          variant="outline"
          className="shrink-0 @max-sm:w-12 @max-sm:px-0"
          aria-label={t("collection_reset")}
          title={t("collection_reset")}
          disabled={disabled || resetDisabled}
          onClick={onReset}
        >
          <RotateCcw aria-hidden />
          <span className="hidden @sm:inline">{t("collection_reset")}</span>
        </Button>
      </div>
      {search && (filters || sort) && criteria}
    </div>
  );
}
