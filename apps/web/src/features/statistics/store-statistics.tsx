import {
  CalendarDays,
  ChartColumn,
  ChartNoAxesCombined,
  Check,
  Package,
  SlidersHorizontal,
} from "lucide-react";
import { lazy, Suspense, useRef } from "react";
import { useAppForm } from "../../components/form";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { useStore } from "../store/store-context";
import { statisticsPeriod, statisticsRange, type StatisticsSearch } from "./statistics-query";
import { StatisticsResultsSkeleton } from "./statistics-results-skeleton";

const StatisticsResults = lazy(() => import("./statistics-results"));
const viewIcons = { summary: ChartColumn, products: Package, modifiers: SlidersHorizontal };

export function StoreStatistics({
  search,
  today,
  onNavigate,
}: {
  onNavigate: (search: StatisticsSearch) => void;
  search: StatisticsSearch;
  today: string;
}) {
  const { t } = useI18n();
  const store = useStore();
  const range = statisticsRange(search, today);
  const manager = ["owner", "admin"].includes(store.role);
  return (
    <>
      <PageHeader
        title={t("statistics_title")}
        icon={<ChartNoAxesCombined />}
        description={t("statistics_basis")}
      />
      {!manager ? (
        <p>{t("statistics_permission")}</p>
      ) : (
        <>
          <section className="space-y-3" aria-label={t("statistics_period")}>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays aria-hidden className="size-4" />
              {t("statistics_period")}
            </h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("statistics_period")}>
              {(["today", "week", "month", "custom"] as const).map((period) => (
                <Button
                  key={period}
                  variant={search.period === period ? "secondary" : "outline"}
                  aria-pressed={search.period === period}
                  onClick={() =>
                    onNavigate({
                      ...search,
                      period,
                      ...(period === "custom"
                        ? (range ?? statisticsPeriod("today", today))
                        : statisticsPeriod(period, today)),
                    })
                  }
                >
                  <CalendarDays aria-hidden />
                  {t(`statistics_period_${period}`)}
                </Button>
              ))}
            </div>
            {search.period === "custom" && (
              <PeriodForm
                key={`${search.from}:${search.to}`}
                from={search.from ?? today}
                to={search.to ?? today}
                onSubmit={(values) => onNavigate({ ...search, ...values })}
              />
            )}
            {!range && (
              <p role="alert" className="text-sm text-destructive">
                {t("statistics_invalid_range")}
              </p>
            )}
          </section>
          <Tabs.Root
            value={search.view}
            className="mt-6 space-y-5"
            onValueChange={(value) => {
              if (
                typeof value === "string" &&
                (value === "summary" || value === "products" || value === "modifiers")
              )
                onNavigate({ ...search, view: value });
            }}
          >
            <Tabs.List aria-label={t("statistics_view")}>
              {(["summary", "products", "modifiers"] as const).map((view) => {
                const Icon = viewIcons[view];
                return (
                  <Tabs.Tab key={view} value={view}>
                    <Icon aria-hidden />
                    {t(`statistics_view_${view}`)}
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>
            {(["summary", "products", "modifiers"] as const).map((view) => (
              <Tabs.Panel key={view} value={view}>
                {range && (
                  <Suspense fallback={<StatisticsResultsSkeleton view={view} />}>
                    <StatisticsResults
                      key={`${store.id}:${range.from}:${range.to}:${view}`}
                      storeId={store.id}
                      range={range}
                      view={view}
                    />
                  </Suspense>
                )}
              </Tabs.Panel>
            ))}
          </Tabs.Root>
        </>
      )}
    </>
  );
}

function PeriodForm({
  from,
  to,
  onSubmit,
}: {
  from: string;
  onSubmit: (range: { from: string; to: string }) => void;
  to: string;
}) {
  const { t } = useI18n();
  const endInput = useRef<HTMLInputElement>(null);
  const form = useAppForm({
    defaultValues: { from, to },
    onSubmitInvalid: () => endInput.current?.focus(),
    validators: {
      onSubmit: ({ value }) =>
        value.from && value.to && value.from <= value.to
          ? undefined
          : { fields: { to: t("statistics_invalid_range") } },
    },
    onSubmit: ({ value }) => onSubmit(value),
  });
  return (
    <form.AppForm>
      <form.Form className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-end gap-3">
        <form.AppField name="from">
          {(field) => <field.DateField required label={t("statistics_from")} />}
        </form.AppField>
        <form.AppField name="to">
          {(field) => <field.DateField ref={endInput} required label={t("statistics_to")} />}
        </form.AppField>
        <Button type="submit" variant="outline" className="col-span-full justify-self-start">
          <Check aria-hidden />
          {t("statistics_apply")}
        </Button>
      </form.Form>
    </form.AppForm>
  );
}
