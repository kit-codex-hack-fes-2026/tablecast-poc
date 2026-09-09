import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { sessionOptions } from "../../lib/session-query";
import type { loadStores } from "../store/store-query";
import { storesOptions } from "../store/store-query";

import { SettingsShell } from "./settings-shell";
type Store = Awaited<ReturnType<typeof loadStores>>["stores"][number];
export function DeviceApproval() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { t } = useI18n();
  const session = useQuery(sessionOptions);
  const userCode = new URLSearchParams(searchStr).get("user_code") ?? "";
  const stores = useQuery({ ...storesOptions, enabled: !!session.data });
  const columns = useMemo(() => deviceApprovalColumns(t, userCode), [t, userCode]);
  return (
    <SettingsShell>
      <h1 className="text-2xl font-semibold">{t("admin_pair")}</h1>
      <p>{t("admin_store")}</p>
      <ErrorNotice error={stores.error} onRetry={() => void stores.refetch()} />
      <DataTable
        data={
          stores.data?.stores.filter((store) => store.role === "owner" || store.role === "admin") ??
          []
        }
        columns={columns}
        getRowId={(row) => row.id}
        empty={t("auth_no_stores")}
      />
    </SettingsShell>
  );
}

function deviceApprovalColumns(
  t: ReturnType<typeof useI18n>["t"],
  userCode: string,
): ColumnDef<Store>[] {
  return [
    { accessorKey: "name", header: t("admin_store") },
    {
      id: "actions",
      header: () => <span className="sr-only">{t("admin_pair")}</span>,
      cell: ({ row }) => (
        <Button
          nativeButton={false}
          role="link"
          variant="outline"
          render={
            <Link
              to="/admin/stores/$storeId/devices/new"
              params={{ storeId: row.original.id }}
              search={{ user_code: userCode }}
            />
          }
        >
          {t("common_select")}
          <ArrowRight />
        </Button>
      ),
    },
  ];
}
