import { createMenuSearch } from "@tablecast/api/catalog-search";
import { resolveText } from "@tablecast/api/localization";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleCheck, CircleSlash, List, Plus, Tags } from "lucide-react";
import { useMemo } from "react";
import { CollectionSelect } from "../../components/collection-select";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { ImageProvider } from "../../components/image-provider";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { CastOverviewPage } from "../configuration/cast-overview-page";
import { StartConfigurationEditing } from "../configuration/configuration-workflow";
import {
  emptyMenuListSearch,
  menuLabels,
  type MenuListSearch,
  type MenuSection,
} from "../configuration/menu-model";
import { draftOptions } from "../configuration/menu-query";
import { parseCollectionSort } from "../shell/collection-model";
import { useStore } from "../store/store-context";
import { catalogOptions } from "./catalog-query";
import { menuCollectionColumns } from "./menu-collection-columns";
import { matchesMenuFilters, menuCollectionRows } from "./menu-collection-model";

export function MenuCollection({
  section,
  draftId,
  search = emptyMenuListSearch,
}: {
  draftId?: string;
  search?: MenuListSearch;
  section: MenuSection;
}) {
  return section === "cast" ? (
    <CastOverviewPage draftId={draftId} />
  ) : (
    <MenuListCollection section={section} draftId={draftId} search={search} />
  );
}
function MenuListCollection({
  section,
  draftId,
  search,
}: {
  draftId?: string;
  search: MenuListSearch;
  section: Exclude<MenuSection, "cast">;
}) {
  const store = useStore();
  const storeId = store.id;
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const catalog = useQuery({ ...catalogOptions(storeId), enabled: !draftId });
  const draft = useQuery({
    ...draftOptions(storeId, draftId ?? ""),
    queryFn: draftId ? draftOptions(storeId, draftId).queryFn : skipToken,
  });
  const error = catalog.error || draft.error;
  const configuration = draftId ? draft.data?.configuration : catalog.data?.configuration;
  const editable = !draftId || ["draft", "ready"].includes(draft.data?.status ?? "");
  const manager = ["owner", "admin"].includes(store.role);
  const columns = useMemo(
    () => menuCollectionColumns(t, locale, section, draftId, storeId, search),
    [t, locale, section, draftId, storeId, search],
  );
  function updateSearch(next: MenuListSearch) {
    const options = { search: { ...search, ...next }, replace: "q" in next, resetScroll: false };
    void (draftId
      ? navigate({
          ...options,
          to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
          params: { storeId, draftId, section },
        })
      : navigate({
          ...options,
          to: "/admin/stores/$storeId/menu/$section",
          params: { storeId, section },
        }));
  }
  const searchMenu = useMemo(
    () => configuration && createMenuSearch(configuration, section),
    [configuration, section],
  );
  const rows = useMemo(
    () => new Map(menuCollectionRows(configuration, section, locale).map((row) => [row.id, row])),
    [configuration, section, locale],
  );
  const data = (searchMenu?.(search.q).ids ?? []).flatMap((id) => {
    const row = rows.get(id);
    return row && matchesMenuFilters(row, section, search) ? [row] : [];
  });

  function renderFilters() {
    const categories = configuration?.categories ?? [];
    return (
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <div className="flex flex-col gap-2 text-sm font-medium">
          <span className="flex items-center gap-2">
            <Tags aria-hidden className="size-4" />
            {t("editor_category")}
          </span>
          <CollectionSelect
            label={t("editor_category")}
            value={search.category ?? ""}
            onValueChange={(value) =>
              updateSearch({ category: value || undefined, page: undefined })
            }
            options={[
              { value: "", label: t("menu_all_categories"), icon: List },
              ...categories.map((category) => ({
                value: category.id,
                label: resolveText(category.text, locale).displayName,
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
          <CollectionSelect
            label={t("menu_availability")}
            value={search.availability ?? ""}
            onValueChange={(value) =>
              updateSearch({
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
  function renderResults() {
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
        defaultSort={
          search.q?.trim() ? { label: t("collection_sort_relevance") } : { id: "name", desc: false }
        }
        data={data}
        filters={section === "products" ? renderFilters() : undefined}
        filtersActive={!!search.category || !!search.availability}
        onReset={() =>
          updateSearch({
            q: undefined,
            category: undefined,
            availability: undefined,
            page: undefined,
            sort: undefined,
          })
        }
        pending={!configuration}
        columns={columns}
        getRowId={(row) => row.id}
        searchLabel={t("menu_search")}
        searchPlaceholder={t("collection_search_menu_placeholder")}
        state={{ globalFilter: search.q ?? "", pagination, sorting }}
        onSortingChange={(next) => {
          const value = (typeof next === "function" ? next(sorting) : next)[0];
          updateSearch({
            sort: value ? `${value.id}:${value.desc ? "desc" : "asc"}` : undefined,
            page: undefined,
          });
        }}
        onGlobalFilterChange={(next) =>
          updateSearch({
            q: (typeof next === "function" ? next(search.q ?? "") : next) || undefined,
            page: undefined,
          })
        }
        onPaginationChange={(next) => {
          const value = typeof next === "function" ? next(pagination) : next;
          updateSearch({ page: value.pageIndex ? value.pageIndex + 1 : undefined });
        }}
        manualFiltering
        empty={t(
          search.q || search.category || search.availability
            ? "common_no_results"
            : "menu_no_items",
        )}
      />
    );
  }
  return (
    <ImageProvider
      basePath={`/api/admin/stores/${storeId}`}
      assets={draftId ? draft.data?.imageAssets : catalog.data?.imageAssets}
    >
      <PageHeader
        title={t(menuLabels[section])}
        actions={
          manager &&
          editable &&
          (draftId ? (
            <Button
              nativeButton={false}
              role="link"
              render={
                <Link
                  to="/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId"
                  params={{ storeId, draftId, section, itemId: "new" }}
                  search={search}
                />
              }
            >
              <Plus />
              {t("common_add")}
            </Button>
          ) : (
            <StartConfigurationEditing
              key={storeId}
              section={section}
              disabled={!configuration}
              onSelect={(nextDraftId) =>
                void navigate({
                  to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
                  params: { storeId, draftId: nextDraftId, section },
                  search,
                })
              }
            />
          ))
        }
      />

      <ErrorNotice
        error={error}
        onRetry={() => void (draftId ? draft.refetch() : catalog.refetch())}
      />
      {(configuration || !error) && renderResults()}
    </ImageProvider>
  );
}
