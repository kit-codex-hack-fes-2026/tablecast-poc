import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { historyOptions } from "../features/floor/history-query";
import { VisitHistory } from "../features/floor/visit-history";
import { collectionSearchSchema } from "../features/shell/collection-model";
import { useI18n } from "../i18n/locale";

export const Route = createFileRoute("/admin/stores/$storeId/visits/")({
  validateSearch: collectionSearchSchema,
  staticData: { document: { title: "admin_history", description: "head_visits_description" } },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureInfiniteQueryData(historyOptions(params.storeId));
  },
  pendingComponent: () => <Page />,
  component: () => <Page />,
});
function Page() {
  const { storeId } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("admin_history")}</h1>
      <VisitHistory
        storeId={storeId}
        onSelect={(sessionId) =>
          void navigate({
            to: "/admin/stores/$storeId/visits/$sessionId",
            params: { storeId, sessionId },
          })
        }
      />
    </>
  );
}
