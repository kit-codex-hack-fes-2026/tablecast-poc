import type { Configuration } from "@tablecast/api/schema";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, FilePenLine, Plus } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { money } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { menuLabels, type MenuSection } from "./menu-model";
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
};
export function MenuCollection({ section, draftId }: { section: MenuSection; draftId?: string }) {
  const store = useStore();
  const storeId = store.id;
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const catalog = useQuery(catalogOptions(storeId));
  const draft = useQuery({
    ...draftOptions(storeId, draftId ?? ""),
    queryFn: draftId ? draftOptions(storeId, draftId).queryFn : skipToken,
  });
  const configuration = draftId ? draft.data?.configuration : catalog.data?.configuration;
  const editable = !draftId || draft.data?.status === "draft" || draft.data?.status === "ready";
  const manager = store.role === "owner" || store.role === "admin";
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      parseResponse(rpc.api.admin.stores[":storeId"].drafts.$post({ param: { storeId } })),
    onSuccess: (next) => {
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
      void navigate({
        to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
        params: { storeId, draftId: next.id, section },
      });
    },
  });
  const columns = useMemo(
    () => menuCollectionColumns(t, locale, section, draftId, storeId),
    [t, locale, section, draftId, storeId],
  );
  function rows(value: Configuration): ItemRow[] {
    if (section === "products")
      return value.products.map((item) => ({
        id: item.id,
        name: item.text[locale].displayName,
        secondary:
          value.categories.find((category) => category.id === item.categoryId)?.text[locale]
            .displayName ?? "",
        imageKey: item.imageKey,
        price: item.price,
        available: item.available,
      }));
    if (section === "plans")
      return value.plans.map((item) => ({
        id: item.id,
        name: item.text[locale].displayName,
        secondary: `${item.durationMinutes} ${t("kiosk_minutes")}`,
        price: item.pricePerPerson,
      }));
    if (section === "categories")
      return value.categories.map((item) => ({
        id: item.id,
        name: item.text[locale].displayName,
        secondary: item.text[locale === "ja" ? "en" : "ja"].displayName,
        count: value.products.filter((product) => product.categoryId === item.id).length,
      }));
    return [{ id: "settings", name: t("editor_cast"), secondary: value.cast.instructions[locale] }];
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {t(menuLabels[section])}
          {draftId && (
            <Badge className="ml-3" variant="secondary">
              {t("admin_draft_version")}
            </Badge>
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
                  />
                }
              >
                <Plus />
                {t("common_add")}
              </Button>
            )
          ) : (
            <Button disabled={create.isPending || !configuration} onClick={() => create.mutate()}>
              <FilePenLine />
              {t("menu_start_editing")}
            </Button>
          ))}
      </div>

      <ErrorNotice error={catalog.error || draft.error || create.error} />
      {configuration ? (
        <DataTable
          data={rows(configuration)}
          columns={columns}
          getRowId={(row) => row.id}
          searchLabel={t("menu_search")}
        />
      ) : (
        <p role="status">{t("common_loading")}</p>
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
          {row.original.imageKey && (
            <img
              src={`/media/${row.original.imageKey}`}
              alt=""
              className="size-12 rounded-md object-cover"
            />
          )}
          <div>
            <span className="font-medium">{row.original.name}</span>
            <span className="block text-sm text-muted-foreground">{row.original.secondary}</span>
          </div>
        </div>
      ),
    },
    ...(section === "products" || section === "plans"
      ? [
          {
            accessorKey: "price",
            header: t("admin_unit_price"),
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
    ...(section === "categories"
      ? [{ accessorKey: "count", header: t("editor_products") } satisfies ColumnDef<ItemRow>]
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
              />
            ) : (
              <Link
                to="/admin/stores/$storeId/menu/$section/$itemId"
                params={{ storeId, section, itemId: row.original.id }}
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
