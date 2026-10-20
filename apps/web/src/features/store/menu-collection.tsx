import type { Configuration } from "@tablecast/api/schema";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ImageOff, Plus } from "lucide-react";
import { useMemo } from "react";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { ProductImage } from "../../components/product-image";
import { PageHeader } from "../../components/page-header";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { m } from "../../paraglide/messages";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { StartConfigurationEditing } from "./configuration-workflow";
import { DraftStatus } from "../shell/configuration-status";
import {
  emptyMenuListSearch,
  menuLabels,
  type MenuListSearch,
  type MenuSection,
} from "./menu-model";
import { catalogOptions, draftOptions } from "./menu-query";
import { useStore } from "./store-shell";
import { CastOverviewPage } from "./cast-overview-page";

type ItemRow = {
  id: string;
  name: string;
  secondary: string;
  imageKey?: string | null;
  price?: number;
  available?: boolean;
  count?: number;
  summary?: string;
  categoryId?: string;
  searchText: string;
  lastOrder?: string;
};
export function MenuCollection({
  section,
  draftId,
  search = emptyMenuListSearch,
}: {
  section: MenuSection;
  draftId?: string;
  search?: MenuListSearch;
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
  section: Exclude<MenuSection, "cast">;
  draftId?: string;
  search: MenuListSearch;
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
    const options = { search: { ...search, ...next }, replace: true, resetScroll: false };
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
  const data = menuCollectionRows(configuration, section, locale).filter((row) =>
    matchesMenuSearch(row, section, search),
  );

  return (
    <>
      <PageHeader
        title={t(menuLabels[section])}
        status={draft.data && <DraftStatus status={draft.data.status} />}
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
      {section === "products" && configuration && (
        <ProductFilters
          categories={configuration.categories}
          search={search}
          onChange={updateSearch}
        />
      )}
      {(configuration || !error) && (
        <MenuResults
          data={data}
          columns={columns}
          search={search}
          pending={!configuration}
          onChange={updateSearch}
        />
      )}
    </>
  );
}

function menuCollectionColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
  section: Exclude<MenuSection, "cast">,
  draftId: string | undefined,
  storeId: string,
  search: MenuListSearch,
): DataTableColumn<ItemRow>[] {
  return [
    {
      accessorKey: "name",
      header: t(
        section === "products"
          ? "admin_product"
          : section === "plans"
            ? "editor_plan"
            : "editor_category",
      ),
      cell: ({ row }) => (
        <div className="flex min-w-56 items-center gap-3">
          {section === "products" &&
            (row.original.imageKey ? (
              <ProductImage
                width={48}
                height={48}
                sizes="48px"
                src={`/media/${row.original.imageKey}`}
                alt=""
                className="size-12 rounded-md object-cover"
              />
            ) : (
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-md bg-secondary"
                aria-label={t("menu_image_missing")}
                role="img"
              >
                <ImageOff className="size-5 text-muted-foreground" />
              </span>
            ))}
          <div className="min-w-0 max-w-sm">
            {draftId ? (
              <Link
                className="inline-flex min-h-11 items-center font-medium whitespace-normal underline decoration-border underline-offset-4 hover:decoration-current wrap-anywhere"
                to="/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId"
                params={{ storeId, draftId, section, itemId: row.original.id }}
                search={search}
              >
                {row.original.name}
              </Link>
            ) : (
              <Link
                className="inline-flex min-h-11 items-center font-medium whitespace-normal underline decoration-border underline-offset-4 hover:decoration-current wrap-anywhere"
                to="/admin/stores/$storeId/menu/$section/$itemId"
                params={{ storeId, section, itemId: row.original.id }}
                search={search}
              >
                {row.original.name}
              </Link>
            )}
            <span className="block whitespace-normal text-sm text-muted-foreground">
              {row.original.secondary}
            </span>
            {row.original.lastOrder && (
              <span className="block text-sm text-muted-foreground">{row.original.lastOrder}</span>
            )}
          </div>
        </div>
      ),
    },
    ...(section === "products" || section === "plans"
      ? [
          {
            accessorKey: "price",
            meta: { align: "right" },
            header: () => (
              <span className="block whitespace-normal">
                {t(section === "plans" ? "editor_plan_price" : "admin_unit_price")}
              </span>
            ),
            cell: ({ row }) => (
              <span className="whitespace-nowrap tabular-nums">
                {money(row.original.price ?? 0, locale)}
              </span>
            ),
          } satisfies DataTableColumn<ItemRow>,
        ]
      : []),
    ...(section === "products"
      ? [
          {
            accessorKey: "available",
            header: t("common_status"),
            cell: ({ row }) => (
              <Badge variant={row.original.available ? "success" : "inactive"}>
                {t(row.original.available ? "editor_available" : "kiosk_sold_out")}
              </Badge>
            ),
          } satisfies DataTableColumn<ItemRow>,
        ]
      : []),
    ...(section === "categories" || section === "plans"
      ? [
          {
            accessorKey: "summary",
            header: t(section === "categories" ? "menu_category_products" : "menu_plan_scope"),
            cell: ({ row }) => (
              <div className="min-w-40 max-w-sm whitespace-normal">
                <span className="font-medium">
                  {row.original.count !== undefined && row.original.count}
                </span>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {row.original.summary || t("common_empty")}
                </p>
              </div>
            ),
          } satisfies DataTableColumn<ItemRow>,
        ]
      : []),
  ];
}

function menuCollectionRows(
  configuration: Configuration | undefined,
  section: Exclude<MenuSection, "cast">,
  locale: ReturnType<typeof useI18n>["locale"],
): ItemRow[] {
  if (!configuration) return [];
  const categories = new Map(configuration.categories.map((category) => [category.id, category]));
  if (section === "products")
    return configuration.products.map((item) => {
      const category = categories.get(item.categoryId);
      return {
        id: item.id,
        name: item.text[locale].displayName,
        secondary: category?.text[locale].displayName ?? "",
        imageKey: item.imageKey,
        price: item.price,
        available: item.available,
        categoryId: item.categoryId,
        searchText: normalise(
          `${menuSearchText(item)} ${category ? menuSearchText(category) : ""}`,
        ),
      };
    });
  if (section === "categories")
    return configuration.categories.map((item) => {
      const products = configuration.products.filter((product) => product.categoryId === item.id);
      return {
        id: item.id,
        name: item.text[locale].displayName,
        secondary: item.text[locale === "ja" ? "en" : "ja"].displayName,
        count: products.length,
        summary: products.map((product) => product.text[locale].displayName).join(" · "),
        searchText: normalise(menuSearchText(item)),
      };
    });
  return configuration.plans.map((item) => ({
    id: item.id,
    name: item.text[locale].displayName,
    secondary: m.menu_plan_duration({ minutes: item.durationMinutes }, { locale }),
    lastOrder: m.menu_plan_last_order({ minutes: item.lastOrderMinutesBeforeEnd }, { locale }),
    price: item.pricePerPerson,
    summary: [
      ...configuration.products.flatMap((product) =>
        item.productIds.includes(product.id) ? [product.text[locale].displayName] : [],
      ),
      ...configuration.categories.flatMap((category) =>
        item.categoryIds.includes(category.id) ? [category.text[locale].displayName] : [],
      ),
      ...item.tags,
    ].join(" · "),
    searchText: normalise(menuSearchText(item)),
  }));
}

const menuSearchText = (item: Configuration["categories"][number]) =>
  Object.values(item.text)
    .flatMap((value) => [value.displayName, value.speechName, ...value.aliases])
    .join(" ");
const normalise = (value: string) => value.normalize("NFKC").toLowerCase();

function matchesMenuSearch(
  row: ItemRow,
  section: Exclude<MenuSection, "cast">,
  search: MenuListSearch,
) {
  return (
    (!search.q || row.searchText.includes(search.q.trim().normalize("NFKC").toLowerCase())) &&
    (section !== "products" || !search.category || row.categoryId === search.category) &&
    (section !== "products" ||
      !search.availability ||
      row.available === (search.availability === "available"))
  );
}

function ProductFilters({
  categories,
  search,
  onChange,
}: {
  categories: Configuration["categories"];
  search: MenuListSearch;
  onChange: (next: MenuListSearch) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t("editor_category")}
        <NativeSelect
          value={search.category ?? ""}
          onChange={(event) =>
            onChange({ category: event.target.value || undefined, page: undefined })
          }
        >
          <option value="">{t("menu_all_categories")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.text[locale].displayName}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t("menu_availability")}
        <NativeSelect
          value={search.availability ?? ""}
          onChange={(event) =>
            onChange({
              availability:
                event.target.value === "available"
                  ? "available"
                  : event.target.value === "sold-out"
                    ? "sold-out"
                    : undefined,
              page: undefined,
            })
          }
        >
          <option value="">{t("menu_all_availability")}</option>
          <option value="available">{t("editor_available")}</option>
          <option value="sold-out">{t("kiosk_sold_out")}</option>
        </NativeSelect>
      </label>
    </div>
  );
}

function MenuResults({
  data,
  columns,
  search,
  pending,
  onChange,
}: {
  data: ItemRow[];
  columns: DataTableColumn<ItemRow>[];
  search: MenuListSearch;
  pending: boolean;
  onChange: (next: MenuListSearch) => void;
}) {
  const { t } = useI18n();
  const pagination = {
    pageIndex: Math.min((search.page ?? 1) - 1, Math.max(0, Math.ceil(data.length / 20) - 1)),
    pageSize: 20,
  };
  return (
    <DataTable
      data={data}
      pending={pending}
      columns={columns}
      getRowId={(row) => row.id}
      searchLabel={t("menu_search")}
      state={{ globalFilter: search.q ?? "", pagination }}
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
