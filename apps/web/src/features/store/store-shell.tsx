import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { createContext, useContext, useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { storesOptions } from "./store-query";

import { apiError } from "../../lib/api-error";
import { AdminShell } from "../shell/admin-shell";

const StoreContext = createContext<{
  id: string;
  name: string;
  logo: string | null;
  role: string;
  organizationId: string;
} | null>(null);
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("STORE_CONTEXT_REQUIRED");
  return store;
}
export function StoreShell({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const stores = useQuery(storesOptions);
  const store = stores.data?.stores.find((item) => item.id === storeId);
  useEffect(() => {
    if (apiError(stores.error)?.status === 401)
      void navigate({
        to: "/login",
        search: { returnTo: window.location.pathname + window.location.search },
      });
  }, [stores.error, navigate]);
  return (
    <AdminShell tab="live" storeId={storeId} header={store?.name ?? t("admin_store")}>
      <ErrorNotice error={stores.error} onRetry={() => void stores.refetch()} />
      {stores.isPending ? (
        <LoadingState />
      ) : store ? (
        <StoreContext.Provider value={store}>
          <Outlet />
        </StoreContext.Provider>
      ) : (
        !stores.error && (
          <div className="space-y-4">
            <p>{t("auth_no_stores")}</p>
            <Button nativeButton={false} role="link" render={<Link to="/organisations" />}>
              {t("org_manage")}
            </Button>
          </div>
        )
      )}
    </AdminShell>
  );
}
