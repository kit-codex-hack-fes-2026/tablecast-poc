import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleDollarSign,
  House,
  Radio,
  Table2,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { useRealtime } from "../../lib/use-realtime";
import { floorOptions } from "../floor/floor-query";
import { HomeStatistics } from "../statistics/home-statistics";
import { HomePreparation } from "./home-preparation";
import { useStore } from "./store-context";

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
        icon={<House />}
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
      <section
        className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
        aria-labelledby="tablecast-home-attention"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tablecast-home-attention" className="text-lg font-semibold">
            {t("home_attention")}
          </h2>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${connected ? "bg-success" : "bg-warning"}`}
            />
            {t(connected ? "admin_live_connected" : "admin_live_reconnecting")}
          </span>
        </div>
        <div className="grid gap-3 @xl:grid-cols-3">
          {attention.map(({ filter, label, count, Icon }) => (
            <Link
              key={filter}
              to="/admin/stores/$storeId/floor"
              params={{ storeId: store.id }}
              search={{ view: "list", filter }}
              className={`group flex min-h-16 @xl:min-h-20 items-center gap-3 rounded-xl border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${count > 0 ? (filter === "voice" ? "border-destructive-border bg-destructive-soft hover:border-destructive-border-hover hover:bg-destructive-hover" : "border-warning-border bg-warning-soft hover:border-warning-border-hover hover:bg-warning-hover") : "border-control-edge bg-control shadow-control hover:bg-control-hover"}`}
            >
              <Icon
                aria-hidden="true"
                className={`size-5 shrink-0 ${count > 0 ? (filter === "voice" ? "text-destructive" : "text-warning") : "text-muted-foreground"}`}
              />
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
        <div className="border-t border-border pt-5" aria-labelledby="tablecast-home-current">
          <h2 id="tablecast-home-current" className="sr-only">
            {t("floor_current")}
          </h2>
          <dl className="grid gap-3 @sm:grid-cols-3 @sm:gap-4">
            {(
              [
                ["admin_active", active.length, Table2],
                ["floor_filter_vacant", floor.data.vacantTables.length, UtensilsCrossed],
                [
                  "home_current_guests",
                  active.reduce((sum, table) => sum + table.guestCount, 0),
                  Users,
                ],
              ] as const
            ).map(([label, count, Icon]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 @sm:row-span-2 @sm:grid @sm:grid-rows-subgrid @sm:gap-2"
              >
                <dt className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="text-pretty">{t(label)}</span>
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {count.toLocaleString(locale)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs text-muted-foreground">
            {t("statistics_generated")}: <DateTime value={floor.dataUpdatedAt} />
          </p>
        </div>
      </section>
      {manager && (
        <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_19rem]">
          <HomeStatistics storeId={store.id} today={today} />
          <HomePreparation storeId={store.id} />
        </div>
      )}
    </>
  );
}
