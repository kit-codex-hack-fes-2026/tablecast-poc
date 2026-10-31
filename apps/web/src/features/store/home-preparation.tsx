import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Tablet, UtensilsCrossed } from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useI18n } from "../../i18n/locale";
import { homeOptions } from "./home-query";

export function HomePreparation({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const home = useQuery(homeOptions(storeId));
  const hasProducts = home.data?.hasProducts;
  const hasDevices = home.data?.hasDevices;
  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border border-border bg-card p-5"
        aria-labelledby="tablecast-home-setup"
      >
        <h2 id="tablecast-home-setup" className="font-semibold">
          {t("home_setup")}
        </h2>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/admin/stores/$storeId/onboarding" params={{ storeId }} />}
          className="mt-3 w-full justify-between"
        >
          {t("onboarding_title")}
          <ArrowRight />
        </Button>
        <div className="divide-y divide-border">
          <div className="space-y-2 py-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <UtensilsCrossed aria-hidden="true" className="size-4 text-muted-foreground" />
              {t("home_setup_menu")}
              {hasProducts && (
                <CheckCircle2 aria-hidden="true" className="ml-auto size-4 text-success" />
              )}
            </h3>
            <ErrorNotice query={home} retrying={home.isFetching} />
            {home.isPending ? (
              <Skeleton className="h-5 w-28" />
            ) : (
              home.data && (
                <p className="text-sm text-muted-foreground">
                  {t(hasProducts ? "home_menu_ready" : "home_menu_empty")}
                </p>
              )
            )}
            <Button
              variant="link"
              size="text"
              nativeButton={false}
              role="link"
              render={
                <Link
                  to="/admin/stores/$storeId/menu/$section"
                  params={{ storeId, section: "products" }}
                />
              }
            >
              {t("home_manage_menu")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <div className="space-y-2 py-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Tablet aria-hidden="true" className="size-4 text-muted-foreground" />
              {t("home_setup_devices")}
              {hasDevices && (
                <CheckCircle2 aria-hidden="true" className="ml-auto size-4 text-success" />
              )}
            </h3>
            <ErrorNotice query={home} retrying={home.isFetching} />
            {home.isPending ? (
              <Skeleton className="h-5 w-28" />
            ) : (
              home.data && (
                <p className="text-sm text-muted-foreground">
                  {t(hasDevices ? "home_devices_ready" : "home_devices_empty")}
                </p>
              )
            )}
            <Button
              variant="link"
              size="text"
              nativeButton={false}
              role="link"
              render={<Link to="/admin/stores/$storeId/devices" params={{ storeId }} />}
            >
              {t("home_manage_devices")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <div className="pt-3">
            <Button
              variant="link"
              size="text"
              nativeButton={false}
              role="link"
              render={
                <Link
                  to="/admin/stores/$storeId/demo"
                  params={{ storeId }}
                  search={{ demoId: undefined }}
                />
              }
            >
              {t("demo_title")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>
      <section
        className="overflow-hidden rounded-2xl border border-border bg-surface-subtle"
        aria-labelledby="tablecast-home-plugin"
      >
        <img
          src="/images/tablecast-connection.svg"
          alt=""
          width={320}
          height={240}
          className="h-28 w-full object-contain"
          loading="lazy"
        />
        <div className="space-y-3 px-5 pb-5">
          <h2 id="tablecast-home-plugin" className="font-semibold">
            {t("home_plugin_title")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("home_plugin_hint")}</p>
          <Button
            variant="outline"
            nativeButton={false}
            role="link"
            render={<Link to="/account/integrations/plugins" />}
          >
            {t("home_plugin_cta")}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
