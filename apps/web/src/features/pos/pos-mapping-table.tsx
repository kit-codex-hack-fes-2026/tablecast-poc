import type { PosCatalog, PosSettings } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { useState } from "react";
import type { DataTableColumn } from "../../components/data-table-model";
import { CustomisationContent, CustomisationPrice } from "../../components/customisation-content";
import { DataTable } from "../../components/data-table";
import { MenuOptionImage } from "../../components/menu-option-image";
import { Money } from "../../components/money";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import {
  matchesPosMapping,
  type PosMappingFilter,
  type PosMappingRow,
  posMappingRows,
} from "./pos-mapping-model";

const filters = ["all", "mapped", "unmapped", "duplicate", "review"] as const;
type MappingTableRow = PosMappingRow & { renderMapping: (row: PosMappingRow) => ReactNode };
function SourceCell({ row }: { row: { original: MappingTableRow } }) {
  return <MappingSource row={row.original} />;
}
function SquareCell({ row }: { row: { original: MappingTableRow } }) {
  return <div className="w-96 max-w-96">{row.original.renderMapping(row.original)}</div>;
}
function StatusCell({ row }: { row: { original: MappingTableRow } }) {
  return <MappingStatus row={row.original} />;
}

export function PosMappingTable({
  products,
  mappings,
  catalog,
  renderMapping,
}: {
  catalog?: PosCatalog;
  mappings: PosSettings["mappings"];
  products: PosSettings["products"];
  renderMapping: (row: PosMappingRow) => ReactNode;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<PosMappingFilter>("all");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const rows = posMappingRows(products, mappings, catalog).map((row) => ({
    ...row,
    renderMapping,
  }));
  const columns: DataTableColumn<MappingTableRow>[] = [
    {
      id: "local",
      header: "TableCast",
      meta: { rowHeader: true },
      enableSorting: false,
      accessorFn: (row) =>
        [row.product.name.ja, row.product.name.en, row.name.ja, row.name.en, row.remote?.name].join(
          " ",
        ),
      cell: SourceCell,
    },
    {
      id: "square",
      header: "Square",
      enableSorting: false,
      cell: SquareCell,
    },
    {
      id: "status",
      header: t("pos_mapping_status"),
      enableSorting: false,
      cell: StatusCell,
    },
  ];
  return (
    <DataTable
      data={rows.filter((row) => matchesPosMapping(row, filter))}
      columns={columns}
      state={{ globalFilter: search, pagination }}
      onGlobalFilterChange={(next) => {
        setSearch(next);
        setPagination((value) => ({ ...value, pageIndex: 0 }));
      }}
      onPaginationChange={setPagination}
      getRowId={(row) => row.id}
      tableLabel={t("pos_mapping")}
      searchLabel={t("pos_mapping_search")}
      filters={
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("pos_mapping_status")}>
          {filters.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "secondary" : "outline"}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPagination((page) => ({ ...page, pageIndex: 0 }));
              }}
            >
              {t(`pos_mapping_filter_${value}`)}
              <span className="tabular-nums">
                {rows.filter((row) => matchesPosMapping(row, value)).length}
              </span>
            </Button>
          ))}
        </div>
      }
      filtersActive={filter !== "all"}
      onReset={() => {
        setFilter("all");
        setSearch("");
        setPagination((page) => ({ ...page, pageIndex: 0 }));
      }}
    />
  );
}

function MappingSource({ row }: { row: PosMappingRow }) {
  const { locale, t } = useI18n();
  return (
    <div className="flex min-w-60 max-w-96 items-center gap-3 py-1">
      {row.option ? (
        <div className="min-w-0 flex-1 pl-4">
          <span className="mb-1 block text-xs text-muted-foreground">
            {row.product.name[locale]}
          </span>
          <CustomisationContent
            name={row.name[locale]}
            imageKey={row.option.imageKey}
            imageKind={row.option.imageKind}
            compact
          />
        </div>
      ) : (
        <>
          <MenuOptionImage
            imageKey={row.product.imageKey}
            imageKind={row.product.imageKind}
            compact
          />
          <div className="min-w-0 flex-1 font-medium wrap-anywhere">
            {row.name[locale]}
            {!row.product.available && (
              <span className="ml-2 text-xs text-muted-foreground">{t("kiosk_sold_out")}</span>
            )}
          </div>
        </>
      )}
      <span className="ml-auto shrink-0 tabular-nums">
        {row.option ? (
          <CustomisationPrice value={row.price} showZero />
        ) : (
          <Money value={row.price} />
        )}
      </span>
    </div>
  );
}

function MappingStatus({ row }: { row: PosMappingRow }) {
  const { t, locale } = useI18n();
  if (!row.externalId) return <Badge variant="inactive">{t("pos_mapping_filter_unmapped")}</Badge>;
  if (!row.loaded)
    return <span className="text-sm text-muted-foreground">{t("pos_mapping_unchecked")}</span>;
  if (!row.issues.length && !row.duplicateWith.length)
    return <Badge variant="success">{t("pos_mapping_filter_mapped")}</Badge>;
  const messages = {
    invalid: "pos_missing_reference",
    parent: "pos_mapping_parent_required",
    price: "pos_issue_price",
    unavailable: "pos_unavailable",
  } as const;
  return (
    <div className="max-w-60 space-y-1 text-sm">
      {row.duplicateWith.length > 0 && (
        <>
          <Badge variant="warning">{t("pos_mapping_filter_duplicate")}</Badge>
          <p className="text-muted-foreground wrap-anywhere">
            {m.pos_mapping_duplicate_with(
              {
                names: row.duplicateWith
                  .map((name) => name[locale])
                  .join(locale === "ja" ? "、" : ", "),
              },
              { locale },
            )}
          </p>
        </>
      )}
      {row.issues.map((issue) => (
        <p key={issue} className="text-warning">
          {t(messages[issue])}
        </p>
      ))}
    </div>
  );
}
