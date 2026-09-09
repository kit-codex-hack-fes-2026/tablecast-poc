import { catalogOptions } from "../features/store/menu-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorNotice } from "../components/error-notice";
import { OpenTable } from "../features/store/open-table";
import { floorOptions } from "../features/store/store-query";
import { useI18n } from "../i18n/locale";

export const Route = createFileRoute("/admin/stores/$storeId/tables/$tableId/open")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(floorOptions(params.storeId)),
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
    ]);
  },
  component: Page,
});
function Page() {
  const { storeId, tableId } = Route.useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const state = useQuery(floorOptions(storeId));
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
