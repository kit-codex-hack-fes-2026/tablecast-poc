import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { storesOptions } from "./store-query";

import { apiError } from "../../lib/api-error";
import { Badge } from "../../components/ui/badge";
import { StorePicker } from "../shell/admin-sidebar";
import { authClient, authResult } from "../../lib/auth-client";
import { AdminShell } from "../shell/admin-shell";
import { useConfigurationRoute } from "../shell/configuration-route";

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
  const { active: inMenu, draftId } = useConfigurationRoute();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const group =
    inMenu || pathname.endsWith("/games")
      ? "admin_config"
      : /\/(points|coupons)$/.test(pathname)
        ? "nav_rewards"
        : /\/(members|devices|profile)$/.test(pathname)
          ? "nav_store_management"
          : "nav_operations";
  const stores = useQuery(storesOptions);
  const client = useQueryClient();
  const changeOrganisation = useMutation({
    mutationFn: async (nextStoreId: string) => {
      const selected = stores.data?.stores.find((item) => item.id === nextStoreId);
      if (!selected) throw new Error("STORE_NOT_FOUND");
      authResult(
        await authClient.organization.setActive({ organizationId: selected.organizationId }),
      );
      return nextStoreId;
    },
    onSuccess: async (nextStoreId) => {
      await client.invalidateQueries({ queryKey: ["tablecast-membership"] });
      await navigate({ to: "/admin/stores/$storeId/floor", params: { storeId: nextStoreId } });
    },
  });
  const store = stores.data?.stores.find((item) => item.id === storeId);
  useEffect(() => {
    if (apiError(stores.error)?.status === 401)
      void navigate({
        to: "/login",
        search: { returnTo: window.location.pathname + window.location.search },
      });
  }, [stores.error, navigate]);
  return (
    <AdminShell
      tab="live"
      storeId={storeId}
      storeName={store?.name}
      renderStorePicker={({ collapsed, onNavigate }) => (
        <StorePicker
          stores={stores.data?.stores ?? []}
          selectedStore={storeId}
          pending={changeOrganisation.isPending}
          error={changeOrganisation.error}
          collapsed={collapsed}
          onChange={(id) => changeOrganisation.mutate(id, { onSuccess: () => onNavigate?.() })}
        />
      )}
      header={
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t(group)}</span>
          {inMenu && (
            <Badge variant="outline">{t(draftId ? "demo_draft" : "demo_published")}</Badge>
          )}
        </div>
      }
    >
      <ErrorNotice error={stores.error} onRetry={() => void stores.refetch()} />
      {stores.isPending ? (
        <LoadingState />
      ) : store ? (
        <StoreContext.Provider key={store.id} value={store}>
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
