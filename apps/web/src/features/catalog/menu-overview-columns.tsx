import { Banknote, CircleCheck, Layers, Package } from "lucide-react";
import type { useI18n } from "../../i18n/locale";
import { type DataTableColumn } from "../../components/data-table-model";
import { MenuOptionImage } from "../../components/menu-option-image";
import { Badge } from "../../components/ui/badge";
import { money } from "../../i18n/format";

type OptionRow = {
  available: boolean;
  description: string;
  group: string;
  id: string;
  imageKey: null | string;
  imageKind: "illustration" | "photograph";
  name: string;
  price: number;
};

export function menuOverviewColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
): DataTableColumn<OptionRow>[] {
  return [
    { accessorKey: "group", header: t("editor_modifiers"), meta: { icon: Layers } },
    {
      accessorKey: "name",
      meta: { icon: Package },
      header: t("editor_options"),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <MenuOptionImage imageKey={row.original.imageKey} imageKind={row.original.imageKind} />
          <div className="min-w-0">
            <span className="font-medium">{row.original.name}</span>
            {row.original.description && (
              <p className="mt-1 whitespace-normal text-sm text-muted-foreground">
                {row.original.description}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "price",
      meta: { icon: Banknote, align: "right" },
      header: t("editor_price_delta"),
      cell: ({ row }) => money(row.original.price, locale),
    },
    {
      accessorKey: "available",
      meta: { icon: CircleCheck },
      header: t("common_status"),
      cell: ({ row }) => (
        <Badge variant="outline">
          {t(row.original.available ? "editor_available" : "kiosk_sold_out")}
        </Badge>
      ),
    },
  ];
}
