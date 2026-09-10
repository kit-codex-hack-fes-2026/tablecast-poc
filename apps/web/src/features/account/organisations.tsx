import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, Plus, Settings2 } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { StoreIcon } from "../../components/store-icon";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { RoleBadge } from "../../components/role-badge";
import type { loadStores } from "../store/store-query";
import { storesOptions } from "../store/store-query";
import { SettingsShell } from "../shell/settings-shell";
type StoreRow = Awaited<ReturnType<typeof loadStores>>["stores"][number];
export function Organisations() {
  const { t } = useI18n();
  const stores = useSuspenseQuery(storesOptions);
  const columns = useMemo(() => storeColumns(t), [t]);
  return (
    <SettingsShell>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("stores_title")}</h1>
        <Button nativeButton={false} role="link" render={<Link to="/stores/new" />}>
          <Plus />
          {t("stores_create")}
        </Button>
      </div>
      <ErrorNotice error={stores.error} onRetry={() => void stores.refetch()} />
      <DataTable
        data={stores.data.stores}
        columns={columns}
        getRowId={(row) => row.id}
        searchLabel={t("stores_search")}
        empty={t("stores_empty")}
      />
    </SettingsShell>
  );
}
function storeColumns(t: ReturnType<typeof useI18n>["t"]): ColumnDef<StoreRow>[] {
  return [
    {
      accessorKey: "name",
      header: t("admin_store"),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <StoreIcon name={row.original.name} logo={row.original.logo} />
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: t("org_role"),
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      id: "actions",
      header: t("admin_details"),
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            nativeButton={false}
            role="link"
            render={
              <Link to="/admin/stores/$storeId/floor" params={{ storeId: row.original.id }} />
            }
          >
            {t("admin_live")}
            <ArrowUpRight />
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            role="link"
            render={
              <Link to="/admin/stores/$storeId/profile" params={{ storeId: row.original.id }} />
            }
          >
            <Settings2 />
            {t("store_profile")}
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            role="link"
            render={
              <Link to="/admin/stores/$storeId/members" params={{ storeId: row.original.id }} />
            }
          >
            {t("org_members")}
          </Button>
        </div>
      ),
    },
  ];
}
