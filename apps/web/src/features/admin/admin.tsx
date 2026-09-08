import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

import { ApiFailure, parseResponse, rpc } from "../../lib/api";
import { authClient } from "../../lib/auth-client";
import { AdminShell } from "./admin-shell";

export function Admin() {
  const { t } = useI18n();
  const search = useSearch({ from: "/admin/live" });
  const navigate = useNavigate();
  const active = authClient.useActiveOrganization();
  const stores = useQuery({
    queryKey: ["tablecast-stores"],
    queryFn: () => parseResponse(rpc.api.admin.stores.$get()),
  });
  const store =
    stores.data?.stores.find((item) => item.id === search.storeId) ??
    stores.data?.stores.find((item) => item.organizationId === active.data?.id) ??
    stores.data?.stores[0];
  useEffect(() => {
    if (stores.error instanceof ApiFailure && stores.error.status === 401) {
      void navigate({
        to: "/login",
        search: { returnStoreId: search.storeId, returnDraftId: search.draftId },
        replace: true,
      });
      return;
    }
    if (!store || active.isPending) return;
    if (search.draftId)
      void navigate({
        to: "/admin/stores/$storeId/menu/changes/$draftId",
        params: { storeId: store.id, draftId: search.draftId },
        replace: true,
      });
    else if (search.section === "settings")
      void navigate({
        to: "/admin/stores/$storeId/menu/$section",
        params: { storeId: store.id, section: "products" },
        replace: true,
      });
    else if (search.section === "history")
      void navigate({
        to: "/admin/stores/$storeId/visits",
        params: { storeId: store.id },
        replace: true,
      });
    else
      void navigate({
        to: "/admin/stores/$storeId/floor",
        params: { storeId: store.id },
        replace: true,
      });
  }, [
    active.isPending,
    store,
    stores.error,
    navigate,
    search.draftId,
    search.section,
    search.storeId,
  ]);
  return (
    <AdminShell tab="live" header={t("admin_store")}>
      <ErrorNotice error={stores.error} />
      {!store && !stores.isPending && !stores.error ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-input p-6">
          <Building2 className="size-10" />
          <h1 className="text-2xl font-semibold">{t("auth_no_stores")}</h1>
          <p>{t("org_empty_hint")}</p>
          <Button nativeButton={false} role="link" render={<Link to="/organisations" />}>
            {t("org_manage")}
          </Button>
        </div>
      ) : (
        <p role="status">{t("common_loading")}</p>
      )}
    </AdminShell>
  );
}
