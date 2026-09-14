import type { Configuration } from "@tablecast/api/schema";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, ImageOff, Plus } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { ProductImage } from "../../components/product-image";
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
  const store = useStore();
  const storeId = store.id;
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const catalog = useQuery({ ...catalogOptions(storeId), enabled: !draftId });
  const draft = useQuery({
    ...draftOptions(storeId, draftId ?? ""),
    queryFn: draftId ? draftOptions(storeId, draftId).queryFn : skipToken,
  });
  const configuration = draftId ? draft.data?.configuration : catalog.data?.configuration;
  const editable = !draftId || draft.data?.status === "draft" || draft.data?.status === "ready";
  const manager = store.role === "owner" || store.role === "admin";
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
  const data = configuration
    ? menuCollectionRows(configuration, section, locale, t).filter(
        (row) =>
          (!search.q ||
            row.searchText.includes(search.q.trim().normalize("NFKC").toLocaleLowerCase())) &&
          (section !== "products" || !search.category || row.categoryId === search.category) &&
          (section !== "products" ||
            !search.availability ||
            row.available === (search.availability === "available")),
      )
    : [];
  const pagination = {
    pageIndex: Math.min((search.page ?? 1) - 1, Math.max(0, Math.ceil(data.length / 20) - 1)),
    pageSize: 20,
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {t(menuLabels[section])}
          {draft.data && (
            <span className="ml-3">
              <DraftStatus status={draft.data.status} />
            </span>
          )}
        </h1>
        {manager &&
          editable &&
          (draftId ? (
            section !== "cast" && (
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
            )
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
          ))}
      </div>

      <ErrorNotice
        error={catalog.error || draft.error}
        onRetry={() => void (draftId ? draft.refetch() : catalog.refetch())}
      />
      {section === "products" && configuration && (
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t("editor_category")}
            <NativeSelect
              value={search.category ?? ""}
              onChange={(event) =>
                updateSearch({ category: event.target.value || undefined, page: undefined })
              }
            >
              <option value="">{t("menu_all_categories")}</option>
              {configuration.categories.map((category) => (
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
                updateSearch({
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
      )}
      {(configuration || !(catalog.error || draft.error)) && (
        <DataTable
          data={data}
          pending={!configuration}
          columns={columns}
          getRowId={(row) => row.id}
          searchLabel={t("menu_search")}
          state={{ globalFilter: search.q ?? "", pagination }}
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
      )}
    </>
  );
}

function menuCollectionColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
  section: MenuSection,
  draftId: string | undefined,
  storeId: string,
  search: MenuListSearch,
): ColumnDef<ItemRow>[] {
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
            <span className="font-medium whitespace-normal wrap-break-word">
              {row.original.name}
            </span>
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
            header: t(section === "plans" ? "editor_plan_price" : "admin_unit_price"),
            cell: ({ row }) => (
              <span className="whitespace-nowrap tabular-nums">
                {money(row.original.price ?? 0, locale)}
              </span>
            ),
          } satisfies ColumnDef<ItemRow>,
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
          } satisfies ColumnDef<ItemRow>,
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
          } satisfies ColumnDef<ItemRow>,
        ]
      : []),
    {
      id: "actions",
      header: () => <span className="sr-only">{t("admin_details")}</span>,
      cell: ({ row }) => (
        <Button
          nativeButton={false}
          role="link"
          variant="ghost"
          render={
            draftId ? (
              <Link
                to="/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId"
                params={{ storeId, draftId, section, itemId: row.original.id }}
                search={search}
              />
            ) : (
              <Link
                to="/admin/stores/$storeId/menu/$section/$itemId"
                params={{ storeId, section, itemId: row.original.id }}
                search={search}
              />
            )
          }
        >
          {t("admin_details")}
          <ArrowUpRight className="size-4" />
        </Button>
      ),
    },
  ];
}

function menuCollectionRows(
  configuration: Configuration,
  section: MenuSection,
  locale: ReturnType<typeof useI18n>["locale"],
  t: ReturnType<typeof useI18n>["t"],
): ItemRow[] {
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
  if (section === "plans")
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
  return [
    {
      id: "settings",
      name: t("editor_cast"),
      secondary: configuration.cast.instructions[locale],
      searchText: normalise(Object.values(configuration.cast.instructions).join(" ")),
    },
  ];
}

const menuSearchText = (item: Configuration["categories"][number]) =>
  Object.values(item.text)
    .flatMap((value) => [value.displayName, value.speechName, ...value.aliases])
    .join(" ");
const normalise = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
