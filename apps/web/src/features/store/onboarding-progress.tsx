import { Progress } from "@base-ui/react/progress";
import { AlertCircle, Circle, CircleHelp, RefreshCw } from "lucide-react";
import type { OnboardingData } from "./onboarding-query";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

export function OnboardingProgress({
  value,
  refreshing,
  onRefresh,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  value: OnboardingData["progress"];
}) {
  const { t, locale } = useI18n();
  const metrics = [
    {
      label: "onboarding_review",
      count: value.review,
      Icon: CircleHelp,
      colour: value.review ? "text-warning-text" : "text-muted-foreground",
    },
    {
      label: "onboarding_missing",
      count: value.missing,
      Icon: Circle,
      colour: "text-muted-foreground",
    },
    {
      label: "onboarding_invalid",
      count: value.invalid,
      Icon: AlertCircle,
      colour: value.invalid ? "text-destructive" : "text-muted-foreground",
    },
  ] as const;
  return (
    <section
      aria-label={t("onboarding_data_progress")}
      className="space-y-3 border-b border-border p-4"
    >
      <Progress.Root
        value={value.configured}
        max={value.total}
        locale={locale}
        aria-valuetext={`${value.configured} / ${value.total} ${t("onboarding_configured")}`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Progress.Label className="font-semibold">{t("onboarding_data_progress")}</Progress.Label>
          <div className="flex items-center gap-3">
            <p className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-3xl leading-none font-semibold">{value.configured}</span>
              <span className="text-lg text-muted-foreground">/ {value.total}</span>
              <span className="ml-1 text-sm text-muted-foreground">
                {t("onboarding_configured")}
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("onboarding_refresh")}
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw />
            </Button>
          </div>
        </div>
        <Progress.Track className="h-2 overflow-hidden rounded-full bg-control">
          <Progress.Indicator className="h-full rounded-full bg-info-solid" />
        </Progress.Track>
      </Progress.Root>
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {metrics.map(({ label, count, Icon, colour }) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <Icon aria-hidden className={`size-4 ${colour}`} />
            <dt className="text-muted-foreground">{t(label)}</dt>
            <dd className={`font-semibold tabular-nums ${colour}`}>
              {count.toLocaleString(locale)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{t("onboarding_progress_hint")}</p>
    </section>
  );
}
