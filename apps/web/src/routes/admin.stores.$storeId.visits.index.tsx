import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { VisitHistory } from "../features/admin/visit-history";
import { useI18n } from "../i18n/locale";

export const Route = createFileRoute("/admin/stores/$storeId/visits/")({ component: Page });
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
