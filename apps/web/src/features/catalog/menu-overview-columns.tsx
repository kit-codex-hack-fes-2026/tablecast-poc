import { Banknote, CircleCheck, Layers, Package } from "lucide-react";
import type { useI18n } from "../../i18n/locale";
import { CustomisationContent, CustomisationPrice } from "../../components/customisation-content";
import { type DataTableColumn } from "../../components/data-table-model";
import { Badge } from "../../components/ui/badge";

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
): DataTableColumn<OptionRow>[] {
  return [
    { accessorKey: "group", header: t("editor_modifiers"), meta: { icon: Layers } },
    {
      accessorKey: "name",
      meta: { icon: Package },
      header: t("editor_options"),
      cell: ({ row }) => (
        <CustomisationContent
          name={row.original.name}
          description={row.original.description}
          imageKey={row.original.imageKey}
          imageKind={row.original.imageKind}
          compact={false}
        />
      ),
    },
    {
      accessorKey: "price",
      meta: { icon: Banknote, align: "right" },
      header: t("editor_price_delta"),
      cell: ({ row }) => <CustomisationPrice value={row.original.price} showZero />,
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
