import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Settings2, ShieldCheck, Store, UsersRound } from "lucide-react";
import { useMemo } from "react";
import type { loadStores } from "../store/store-query";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { RoleBadge } from "../../components/role-badge";
import { StoreIcon } from "../../components/store-icon";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { useCollectionSearch } from "../shell/collection-search";
import { SettingsShell } from "../store/settings-shell";
import { storesOptions } from "../store/store-query";
type StoreRow = Awaited<ReturnType<typeof loadStores>>["stores"][number];
export function Organisations() {
  const { t } = useI18n();
  const stores = useSuspenseQuery(storesOptions);
  const collection = useCollectionSearch({ sortIds: ["name", "role"] });
  const columns = useMemo(() => storeColumns(t), [t]);
  return (
    <SettingsShell>
      <PageHeader
        title={t("stores_title")}
        icon={<Store />}
        actions={
          <Button nativeButton={false} role="link" render={<Link to="/stores/new" />}>
            <Plus />
            {t("stores_create")}
          </Button>
        }
      />
      <ErrorNotice error={stores.error} onRetry={() => void stores.refetch()} />
      <DataTable
        {...collection}
        data={stores.data.stores}
        columns={columns}
        getRowId={(row) => row.id}
        searchLabel={t("stores_search")}
        searchPlaceholder={t("stores_search")}
        empty={t("stores_empty")}
      />
    </SettingsShell>
  );
}
function storeColumns(t: ReturnType<typeof useI18n>["t"]): DataTableColumn<StoreRow>[] {
  return [
    {
      accessorKey: "name",
      meta: { icon: Store },
      header: t("admin_store"),
      cell: ({ row }) => (
        <Link
          className="inline-flex min-h-11 min-w-56 max-w-sm items-center gap-3 font-medium whitespace-normal underline decoration-border underline-offset-4 hover:decoration-current wrap-anywhere"
          to="/admin/stores/$storeId"
          params={{ storeId: row.original.id }}
        >
          <span aria-hidden="true">
            <StoreIcon name={row.original.name} logo={row.original.logo} />
          </span>
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "role",
      meta: { icon: ShieldCheck },
      header: t("org_role"),
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      id: "actions",
      header: t("common_actions"),
      cell: ({ row }) => (
        <div className="flex gap-2">
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
            <UsersRound />
            {t("org_members")}
          </Button>
        </div>
      ),
    },
  ];
}
