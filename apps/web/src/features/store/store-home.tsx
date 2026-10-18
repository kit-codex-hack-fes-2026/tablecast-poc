import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleDollarSign,
  Radio,
  Tablet,
  UtensilsCrossed,
} from "lucide-react";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useI18n } from "../../i18n/locale";
import { useRealtime } from "../../lib/use-realtime";
import { catalogOptions } from "./menu-query";
import { devicesOptions, floorOptions } from "./store-query";
import { statisticsOptions } from "./statistics-query";
import { StatisticsSummary } from "./statistics-summary";
import { useStore } from "./store-shell";

export function StoreHome({ today }: { today: string }) {
  const store = useStore();
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const floor = useSuspenseQuery(floorOptions(store.id));
  const connected = useRealtime({ storeId: store.id }, floor.data.cursor, () => {
    void client.invalidateQueries({ queryKey: ["tablecast-admin", store.id] });
    void client.invalidateQueries({ queryKey: ["tablecast-statistics", store.id] });
  });
  const active = floor.data.tables.filter((table) => table.status === "open");
  const attention = [
    {
      filter: "called",
      label: "floor_filter_called",
      count: active.filter((table) => table.staffCalled).length,
      Icon: Bell,
    },
    {
      filter: "billing",
      label: "admin_billing",
      count: active.filter((table) => table.billRequested && table.bill.due > 0).length,
      Icon: CircleDollarSign,
    },
    {
      filter: "voice",
      label: "admin_voice_errors",
      count: active.filter((table) => table.voiceState === "error").length,
      Icon: Radio,
    },
  ] as const;
  const manager = ["owner", "admin"].includes(store.role);
  return (
    <>
      <PageHeader
        title={t("home_title")}
        description={store.name}
        actions={
          <Button
            nativeButton={false}
            role="link"
            render={<Link to="/admin/stores/$storeId/floor" params={{ storeId: store.id }} />}
          >
            {t("home_open_floor")}
            <ArrowRight className="size-4" />
          </Button>
        }
      />
      <ErrorNotice
        error={floor.error}
        onRetry={() => void floor.refetch()}
        retrying={floor.isFetching}
      />
      <section className="space-y-4" aria-labelledby="tablecast-home-attention">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tablecast-home-attention" className="text-lg font-semibold">
            {t("home_attention")}
          </h2>
          <span className="text-sm text-muted-foreground">
            {t(connected ? "admin_live_connected" : "admin_live_reconnecting")}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {attention.map(({ filter, label, count, Icon }) => (
            <Link
              key={filter}
              to="/admin/stores/$storeId/floor"
              params={{ storeId: store.id }}
              search={{ view: "list", filter }}
              className={`group flex min-h-24 items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${count > 0 ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">{t(label)}</span>
              <span className="text-2xl font-semibold tabular-nums">
                {count.toLocaleString(locale)}
              </span>
              <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
        {attention.every((item) => item.count === 0) && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" />
            {t("home_all_clear")}
          </p>
        )}
      </section>
      <section
        className="rounded-2xl border border-border bg-card p-5 sm:p-6"
        aria-labelledby="tablecast-home-current"
      >
        <h2 id="tablecast-home-current" className="mb-5 text-lg font-semibold">
          {t("floor_current")}
        </h2>
        <dl className="grid grid-cols-3 gap-4">
          {(
            [
              ["admin_active", active.length],
              ["floor_filter_vacant", floor.data.vacantTables.length],
              ["home_current_guests", active.reduce((sum, table) => sum + table.guestCount, 0)],
            ] as const
          ).map(([label, count]) => (
            <div key={label} className="space-y-2">
              <dt className="text-sm text-muted-foreground">{t(label)}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {count.toLocaleString(locale)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-xs text-muted-foreground">
          {t("statistics_generated")}: <DateTime value={floor.dataUpdatedAt} />
        </p>
      </section>
      {manager && (
        <>
          <HomeStatistics storeId={store.id} today={today} />
          <SetupSteps storeId={store.id} />
          <section
            className="grid overflow-hidden rounded-2xl border border-border bg-secondary/40 md:grid-cols-[1fr_15rem]"
            aria-labelledby="tablecast-home-plugin"
          >
            <div className="space-y-4 p-5 sm:p-6">
              <div className="space-y-2">
                <h2 id="tablecast-home-plugin" className="text-xl font-semibold">
                  {t("home_plugin_title")}
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {t("home_plugin_hint")}
                </p>
              </div>
              <Button
                nativeButton={false}
                role="link"
                render={<Link to="/account/integrations/plugins" />}
              >
                {t("home_plugin_cta")}
                <ArrowRight className="size-4" />
              </Button>
              <p className="text-xs text-muted-foreground">{t("home_plugin_steps")}</p>
            </div>
            <img
              src="/images/tablecast-connection.svg"
              alt=""
              width={320}
              height={240}
              className="h-40 w-full object-contain md:h-full"
              loading="lazy"
            />
          </section>
        </>
      )}
    </>
  );
}

function HomeStatistics({ storeId, today }: { storeId: string; today: string }) {
  const { t, locale } = useI18n();
  const query = useInfiniteQuery(
    statisticsOptions(storeId, { from: today, to: today }, "summary", locale),
  );
  const result = query.data?.pages[0];
  return (
    <section
      className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
      aria-labelledby="tablecast-home-summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tablecast-home-summary" className="text-lg font-semibold">
            {t("home_closed_today")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("statistics_basis")}</p>
        </div>
        <Button
          variant="link"
          size="text"
          nativeButton={false}
          role="link"
          render={
            <Link
              to="/admin/stores/$storeId/statistics"
              params={{ storeId }}
              search={{ period: "today", view: "summary", from: today, to: today }}
            />
          }
        >
          {t("home_open_statistics")}
          <ArrowRight className="size-4" />
        </Button>
      </div>
      <ErrorNotice
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
      {query.isPending && (
        <div
          role="status"
          aria-label={t("common_loading")}
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          {[1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-20" />
          ))}
        </div>
      )}
      {result && (
        <>
          <StatisticsSummary summary={result.summary} />
          {result.summary.sessions === 0 && (
            <p className="text-sm text-muted-foreground">{t("statistics_empty")}</p>
          )}
          {result.summary.incompleteSnapshots > 0 && (
            <p className="text-sm text-amber-800">{t("statistics_missing")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {today} · {t("statistics_generated")}: <DateTime value={result.generatedAt} />
          </p>
        </>
      )}
    </section>
  );
}

function SetupSteps({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const catalog = useQuery(catalogOptions(storeId));
  const devices = useQuery(devicesOptions(storeId));
  const hasProducts = catalog.data && catalog.data.configuration.products.length > 0;
  const hasDevices = devices.data?.devices.some((device) => device.revokedAt === null);
  return (
    <section className="space-y-4" aria-labelledby="tablecast-home-setup">
      <div>
        <h2 id="tablecast-home-setup" className="text-lg font-semibold">
          {t("home_setup")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("home_setup_hint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border p-5">
          <UtensilsCrossed className="size-6 text-muted-foreground" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">{t("home_setup_menu")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("home_setup_menu_hint")}</p>
          </div>
          <ErrorNotice
            error={catalog.error}
            onRetry={() => void catalog.refetch()}
            retrying={catalog.isFetching}
          />
          {catalog.isPending ? (
            <Skeleton className="h-5 w-28" />
          ) : (
            catalog.data && (
              <p className="text-sm">{t(hasProducts ? "home_menu_ready" : "home_menu_empty")}</p>
            )
          )}
          <Button
            variant="outline"
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
        <div className="space-y-4 rounded-xl border border-border p-5">
          <Tablet className="size-6 text-muted-foreground" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">{t("home_setup_devices")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("home_setup_devices_hint")}</p>
          </div>
          <ErrorNotice
            error={devices.error}
            onRetry={() => void devices.refetch()}
            retrying={devices.isFetching}
          />
          {devices.isPending ? (
            <Skeleton className="h-5 w-28" />
          ) : (
            devices.data && (
              <p className="text-sm">
                {t(hasDevices ? "home_devices_ready" : "home_devices_empty")}
              </p>
            )
          )}
          <Button
            variant="outline"
            nativeButton={false}
            role="link"
            render={<Link to="/admin/stores/$storeId/devices" params={{ storeId }} />}
          >
            {t("home_manage_devices")}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("home_try_hint")}{" "}
        <Link
          to="/admin/stores/$storeId/demo"
          params={{ storeId }}
          search={{ demoId: undefined }}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {t("demo_title")}
        </Link>
      </p>
    </section>
  );
}
