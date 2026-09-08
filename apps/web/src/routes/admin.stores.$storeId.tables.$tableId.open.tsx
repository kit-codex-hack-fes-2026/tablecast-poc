import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorNotice } from "../components/error-notice";
import { OpenTable } from "../features/admin/open-table";
import { useI18n } from "../i18n/locale";

import { parseResponse, rpc } from "../lib/api";
export const Route = createFileRoute("/admin/stores/$storeId/tables/$tableId/open")({
  component: Page,
});
function Page() {
  const { storeId, tableId } = Route.useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const state = useQuery({
    queryKey: ["tablecast-admin", storeId],
    queryFn: () => parseResponse(rpc.api.admin.stores[":storeId"].$get({ param: { storeId } })),
  });
  const table = state.data?.vacantTables.find((item) => item.id === tableId);
  return (
    <>
      <ErrorNotice error={state.error} />
      {table ? (
        <OpenTable
          storeId={storeId}
          table={table}
          onOpened={() =>
            void navigate({ to: "/admin/stores/$storeId/floor", params: { storeId } })
          }
        />
      ) : (
        <p>{state.isPending ? t("common_loading") : t("admin_not_vacant")}</p>
      )}
    </>
  );
}
