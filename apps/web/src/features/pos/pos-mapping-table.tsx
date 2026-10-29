import type { PosCatalog, PosSettings } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { useTable } from "@tanstack/react-table";
import { useState } from "react";
import { CollectionToolbar } from "../../components/collection-toolbar";
import { CustomisationContent, CustomisationPrice } from "../../components/customisation-content";
import { TablePagination } from "../../components/data-table-controls";
import { type DataTableColumn, features } from "../../components/data-table-model";
import { MenuOptionImage } from "../../components/menu-option-image";
import { Money } from "../../components/money";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import {
  matchesPosMapping,
  type PosMappingFilter,
  type PosMappingGroup,
  posMappingGroups,
  type PosMappingRow,
  posMappingRows,
} from "./pos-mapping-model";

const filters = ["all", "mapped", "unmapped", "duplicate", "review"] as const;
const columns: DataTableColumn<PosMappingGroup>[] = [
  { id: "product", accessorFn: (group) => group.product.name.ja },
];

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
  const rows = posMappingRows(products, mappings, catalog);
  const groups = posMappingGroups(rows, filter, search);
  const table = useTable({
    features,
    data: groups,
    columns,
    getRowId: (group) => group.id,
    state: {
      pagination: {
        ...pagination,
        pageIndex: Math.min(
          pagination.pageIndex,
          Math.max(0, Math.ceil(groups.length / pagination.pageSize) - 1),
        ),
      },
    },
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    manualFiltering: true,
  });
  return (
    <div className="space-y-3">
      <CollectionToolbar
        className="max-sm:gap-3 max-sm:[&>fieldset]:basis-full"
        search={{
          label: t("pos_mapping_search"),
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPagination((page) => ({ ...page, pageIndex: 0 }));
          },
        }}
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
        resetDisabled={filter === "all" && !search}
        onReset={() => {
          setFilter("all");
          setSearch("");
          setPagination((page) => ({ ...page, pageIndex: 0 }));
        }}
      />
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)_minmax(7rem,12rem)] gap-4 px-3 text-sm text-muted-foreground @3xl:grid">
        <span>TableCast</span>
        <span>Square</span>
        <span>{t("pos_mapping_status")}</span>
      </div>
      {groups.length ? (
        <div className="space-y-3">
          {table.getRowModel().rows.map(({ original: group }) => (
            <MappingProduct key={group.id} group={group} renderMapping={renderMapping} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          {t("common_no_results")}
        </p>
      )}
      <TablePagination table={table} pending={false} />
    </div>
  );
}

function MappingProduct({
  group,
  renderMapping,
}: {
  group: PosMappingGroup;
  renderMapping: (row: PosMappingRow) => ReactNode;
}) {
  const { t, locale } = useI18n();
  return (
    <article
      aria-label={group.product.name[locale]}
      className="min-w-0 rounded-xl border border-border bg-card"
    >
      <MappingEntry row={group.product} renderMapping={renderMapping} />
      {group.options.length > 0 && (
        <div className="mx-3 mb-3 rounded-lg bg-surface-subtle py-2">
          <h4 className="px-3 text-sm font-medium text-muted-foreground">
            {t("pos_mapping_customisations")}
          </h4>
          <ul aria-label={t("pos_mapping_customisations")} className="ml-3 pl-2">
            {group.options.map((option) => (
              <MappingEntry key={option.id} as="li" row={option} renderMapping={renderMapping} />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function MappingEntry({
  as: Tag = "div",
  row,
  renderMapping,
}: {
  as?: "div" | "li";
  renderMapping: (row: PosMappingRow) => ReactNode;
  row: PosMappingRow;
}) {
  return (
    <Tag
      data-row-id={row.id}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-3 py-2 @3xl:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)_minmax(7rem,12rem)]"
    >
      <div className="col-span-2 min-w-0 @3xl:col-span-1">
        <MappingSource row={row} />
      </div>
      <div className="min-w-0">{renderMapping(row)}</div>
      <MappingStatus row={row} />
    </Tag>
  );
}

function MappingSource({ row }: { row: PosMappingRow }) {
  const { locale, t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-3">
      {row.option ? (
        <CustomisationContent
          className="min-w-0 flex-1"
          name={row.name[locale]}
          imageKey={row.option.imageKey}
          imageKind={row.option.imageKind}
          reserveImageSpace
          compact
        />
      ) : (
        <>
          <MenuOptionImage
            imageKey={row.product.imageKey}
            imageKind={row.product.imageKind}
            reserveImageSpace
            compact
          />
          <div className="min-w-0 flex-1 wrap-anywhere">
            <h3 className="font-medium">{row.name[locale]}</h3>
            {!row.product.available && (
              <span className="text-sm text-muted-foreground">{t("kiosk_sold_out")}</span>
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
