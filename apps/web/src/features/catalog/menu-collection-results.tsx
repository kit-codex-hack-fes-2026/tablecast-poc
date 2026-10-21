import type { Configuration } from "@tablecast/api/schema";
import { CircleCheck, CircleSlash, List, Tags } from "lucide-react";
import { type ReactNode } from "react";
import type { ItemRow } from "./menu-collection-model";
import { CollectionSort } from "../../components/collection-sort";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { useI18n } from "../../i18n/locale";
import { type MenuListSearch } from "../configuration/menu-model";
import { parseCollectionSort } from "../shell/collection-model";

export function ProductFilters({
  categories,
  search,
  onChange,
}: {
  categories: Configuration["categories"];
  onChange: (next: MenuListSearch) => void;
  search: MenuListSearch;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
      <div className="flex flex-col gap-2 text-sm font-medium">
        <span className="flex items-center gap-2">
          <Tags aria-hidden className="size-4" />
          {t("editor_category")}
        </span>
        <CollectionSort
          label={t("editor_category")}
          value={search.category ?? ""}
          onValueChange={(value) => onChange({ category: value || undefined, page: undefined })}
          options={[
            { value: "", label: t("menu_all_categories"), icon: List },
            ...categories.map((category) => ({
              value: category.id,
              label: category.text[locale].displayName,
              icon: Tags,
            })),
          ]}
        />
      </div>
      <div className="flex flex-col gap-2 text-sm font-medium">
        <span className="flex items-center gap-2">
          <CircleCheck aria-hidden className="size-4" />
          {t("menu_availability")}
        </span>
        <CollectionSort
          label={t("menu_availability")}
          value={search.availability ?? ""}
          onValueChange={(value) =>
            onChange({
              availability: value === "available" || value === "sold-out" ? value : undefined,
              page: undefined,
            })
          }
          options={[
            { value: "", label: t("menu_all_availability"), icon: List },
            { value: "available", label: t("editor_available"), icon: CircleCheck },
            { value: "sold-out", label: t("kiosk_sold_out"), icon: CircleSlash },
          ]}
        />
      </div>
    </div>
  );
}

export function MenuResults({
  data,
  columns,
  search,
  pending,
  onChange,
  filters,
}: {
  columns: DataTableColumn<ItemRow>[];
  data: ItemRow[];
  filters?: ReactNode;
  onChange: (next: MenuListSearch) => void;
  pending: boolean;
  search: MenuListSearch;
}) {
  const { t } = useI18n();
  const sorting = parseCollectionSort(
    search.sort,
    columns.flatMap((column) =>
      "accessorKey" in column &&
      typeof column.accessorKey === "string" &&
      column.enableSorting !== false
        ? [column.accessorKey]
        : [],
    ),
  );
  const pagination = {
    pageIndex: Math.min((search.page ?? 1) - 1, Math.max(0, Math.ceil(data.length / 20) - 1)),
    pageSize: 20,
  };
  return (
    <DataTable
      data={data}
      filters={filters}
      filtersActive={!!search.category || !!search.availability}
      onReset={() =>
        onChange({
          q: undefined,
          category: undefined,
          availability: undefined,
          page: undefined,
          sort: undefined,
        })
      }
      pending={pending}
      columns={columns}
      getRowId={(row) => row.id}
      searchLabel={t("menu_search")}
      searchPlaceholder={t("collection_search_menu_placeholder")}
      state={{ globalFilter: search.q ?? "", pagination, sorting }}
      onSortingChange={(next) => {
        const value = (typeof next === "function" ? next(sorting) : next)[0];
        onChange({
          sort: value ? `${value.id}:${value.desc ? "desc" : "asc"}` : undefined,
          page: undefined,
        });
      }}
      onGlobalFilterChange={(next) =>
        onChange({
          q: (typeof next === "function" ? next(search.q ?? "") : next) || undefined,
          page: undefined,
        })
      }
      onPaginationChange={(next) => {
        const value = typeof next === "function" ? next(pagination) : next;
        onChange({ page: value.pageIndex ? value.pageIndex + 1 : undefined });
      }}
      manualFiltering
      empty={t(
        search.q || search.category || search.availability ? "common_no_results" : "menu_no_items",
      )}
    />
  );
}
