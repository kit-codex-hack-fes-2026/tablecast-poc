import { Link } from "@tanstack/react-router";
import { Banknote, CircleCheck, Clock3, ImageOff, Layers, Package, Tags } from "lucide-react";
import type { useI18n } from "../../i18n/locale";
import type { ItemRow } from "./menu-collection-model";
import { type DataTableColumn } from "../../components/data-table-model";
import { ProductImage } from "../../components/product-image";
import { Badge } from "../../components/ui/badge";
import { money } from "../../i18n/format";
import { type MenuListSearch, type MenuSection } from "../configuration/menu-model";

export function menuCollectionColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
  section: Exclude<MenuSection, "cast">,
  draftId: string | undefined,
  storeId: string,
  search: MenuListSearch,
): DataTableColumn<ItemRow>[] {
  const labels = {
    products: "admin_product",
    categories: "editor_category",
    plans: "editor_plan",
    guides: "assistance_guides",
  } as const;
  const nameLabels = {
    products: "collection_product_name",
    categories: "collection_category_name",
    plans: "collection_plan_name",
    guides: "collection_guide_name",
  } as const;
  return [
    {
      accessorKey: "name",
      meta: {
        icon: section === "categories" ? Tags : section === "plans" ? Layers : Package,
        sortLabel: t(nameLabels[section]),
      },
      header: t(labels[section]),
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
            meta: {
              align: "right",
              icon: Banknote,
              sortLabel: t(section === "plans" ? "collection_plan_price" : "collection_unit_price"),
            },
            header: t(section === "plans" ? "editor_plan_price" : "admin_unit_price"),
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
            meta: { icon: CircleCheck },
            header: t("common_status"),
            cell: ({ row }) => (
              <Badge variant={row.original.available ? "success" : "inactive"}>
                {t(row.original.available ? "editor_available" : "kiosk_sold_out")}
              </Badge>
            ),
          } satisfies DataTableColumn<ItemRow>,
        ]
      : []),
    ...(section === "plans"
      ? [
          {
            accessorKey: "duration",
            header: t("editor_duration"),
            meta: { align: "right", icon: Clock3, sortLabel: t("collection_duration") },
            cell: ({ row }) => (
              <span className="whitespace-nowrap tabular-nums">
                {row.original.duration} {t("kiosk_minutes")}
              </span>
            ),
          } satisfies DataTableColumn<ItemRow>,
        ]
      : []),
    ...(section === "categories" || section === "plans"
      ? [
          {
            accessorKey: "count",
            meta: { align: "right", icon: Layers, sortLabel: t("collection_product_count") },
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
