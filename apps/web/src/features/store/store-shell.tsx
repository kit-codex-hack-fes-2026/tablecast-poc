import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { apiError } from "../../lib/api-error";
import { ConfigurationHeader } from "../configuration/configuration-header";
import { useConfigurationRoute } from "../configuration/configuration-route";
import { ConfigurationToolbarProvider } from "../configuration/configuration-toolbar";
import { StoreAdminShell } from "./admin-shell";
import { StoreContext } from "./store-context";
import { storesOptions } from "./store-query";

export function StoreShell({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { active: inMenu } = useConfigurationRoute();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const group =
    inMenu || pathname.endsWith("/games")
      ? "admin_config"
      : /\/(points|coupons)$/.test(pathname)
        ? "nav_rewards"
        : /\/(members|devices|profile|pos)$/.test(pathname)
          ? "nav_store_management"
          : "nav_operations";
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
    <ConfigurationToolbarProvider key={storeId}>
      <StoreAdminShell
        tab="live"
        storeId={storeId}
        storeName={store?.name}
        header={
          inMenu && store ? (
            <ConfigurationHeader
              key={`${storeId}:${pathname}`}
              storeId={storeId}
              role={store.role}
            />
          ) : (
            <span className="text-sm text-muted-foreground">{t(group)}</span>
          )
        }
      >
        <ErrorNotice query={stores} />
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
      </StoreAdminShell>
    </ConfigurationToolbarProvider>
  );
}
