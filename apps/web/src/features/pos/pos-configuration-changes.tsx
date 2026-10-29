import type { ConfigDraft, Configuration, PosMapping } from "@tablecast/api/schema";
import { resolveLocalized, resolveText } from "@tablecast/api/localization";
import { posBindingSchema } from "@tablecast/api/schema";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { DataTableColumn } from "../../components/data-table-model";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { SquareLogo } from "../../components/square-logo";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
import { posCatalogOptions, posSettingsOptions } from "./pos-query";

type MappingChange = { after: string; before: string; id: string; name: string };

/** 対応IDの差分を商品名とSquare登録名へ解決し、公開前後を並べる。 */
export function PosConfigurationChanges({
  change,
  configuration,
  storeId,
}: {
  change: ConfigDraft["changes"][number];
  configuration: Configuration;
  storeId?: string;
}) {
  const { locale, t } = useI18n();
  const settings = useQuery({ ...posSettingsOptions(storeId ?? ""), enabled: !!storeId });
  const catalog = useQuery({
    ...posCatalogOptions(storeId ?? "", settings.data?.connection?.locationId ?? ""),
    enabled: !!storeId && settings.data?.connection?.status === "connected",
  });
  const columns = useMemo<DataTableColumn<MappingChange>[]>(
    () => [
      { accessorKey: "name", header: t("pos_mapping"), meta: { rowHeader: true } },
      { accessorKey: "before", header: t("admin_before") },
      { accessorKey: "after", header: t("admin_after") },
    ],
    [t],
  );
  const before = posBindingSchema.nullable().safeParse(change.before);
  const after = posBindingSchema.nullable().safeParse(change.after);
  if (!before.success || !after.success) return <p role="alert">{t("common_invalid_input")}</p>;
  const names = new Map<string, string>(
    settings.data?.products.flatMap((product): [string, string][] => [
      [
        `product:${product.id}`,
        `${t("pos_change_product")} · ${resolveLocalized(product.name, locale)}`,
      ],
      ...product.options.map((option): [string, string] => [
        `option:${option.id}`,
        `${t("pos_change_option")} · ${resolveLocalized(option.name, locale)}`,
      ]),
    ]),
  );
  for (const [id, name] of configuration.products.flatMap((product): [string, string][] => [
    [
      `product:${product.id}`,
      `${t("pos_change_product")} · ${resolveText(product.text, locale).displayName}`,
    ],
    ...product.modifiers.flatMap((group) =>
      group.options.map((option): [string, string] => [
        `option:${option.id}`,
        `${t("pos_change_option")} · ${resolveText(option.text, locale).displayName}`,
      ]),
    ),
  ]))
    names.set(id, name);
  const remote = new Map(
    catalog.data?.items.flatMap((item): [string, string][] => [
      [`product:${item.id}`, item.name],
      ...item.options.map((option): [string, string] => [`option:${option.id}`, option.name]),
    ]),
  );
  const previous = new Map(
    before.data?.mappings.map((mapping) => [`${mapping.kind}:${mapping.localId}`, mapping]),
  );
  const next = new Map(
    after.data?.mappings.map((mapping) => [`${mapping.kind}:${mapping.localId}`, mapping]),
  );
  const remoteName = (mapping: PosMapping | undefined, connectionId: string | undefined) => {
    if (!mapping) return t("pos_unmapped");
    if (connectionId !== settings.data?.connection?.id) return t("pos_mapping_unchecked");
    return (
      remote.get(`${mapping.kind}:${mapping.externalId}`) ??
      t(catalog.data ? "pos_missing_reference" : "pos_mapping_unchecked")
    );
  };
  const rows: MappingChange[] = [...new Set([...previous.keys(), ...next.keys()])].flatMap((id) => {
    const left = previous.get(id),
      right = next.get(id);
    return left?.externalId === right?.externalId &&
      before.data?.connectionId === after.data?.connectionId
      ? []
      : [
          {
            id,
            name: names.get(id) ?? t("editor_missing_reference"),
            before: remoteName(left, before.data?.connectionId),
            after: remoteName(right, after.data?.connectionId),
          },
        ];
  });
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <h2 className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-subtle p-3">
        <span className="p-3">
          <SquareLogo />
        </span>
        {t("pos_mapping")}
      </h2>
      <div className="space-y-3 p-4" data-ui="config-change" data-change-path="pos">
        {before.data?.connectionId !== after.data?.connectionId && (
          <p className="flex items-center gap-2 text-sm">
            {t("pos_change_connection")}
            <Badge variant="warning">{t("config_change_updated")}</Badge>
          </p>
        )}
        <ErrorNotice
          error={settings.error || catalog.error}
          onRetry={() => void (settings.error ? settings.refetch() : catalog.refetch())}
          retrying={settings.isFetching || catalog.isFetching}
        />
        <DataTable
          data={rows}
          columns={columns}
          defaultSort={{ id: "name", desc: false }}
          getRowId={(row) => row.id}
          tableLabel={t("pos_change_target")}
          searchLabel={t("pos_mapping_search")}
        />
      </div>
    </section>
  );
}
