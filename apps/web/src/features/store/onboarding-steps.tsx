import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  CircleHelp,
  FileWarning,
} from "lucide-react";
import type { OnboardingData } from "./onboarding-query";
import { useI18n } from "../../i18n/locale";
import { onboardingLabels, onboardingStatuses } from "./onboarding-model";
const stateIcons = {
  configured: CheckCircle2,
  invalid: FileWarning,
  missing: Circle,
  optional: CircleDashed,
  review: CircleHelp,
};
const stateTones = {
  configured: "text-success",
  invalid: "text-destructive",
  missing: "text-muted-foreground",
  optional: "text-muted-foreground",
  review: "text-warning-text",
};
export function OnboardingSteps({
  steps,
  nextStepId,
}: {
  nextStepId: OnboardingData["progress"]["nextStepId"];
  steps: OnboardingData["steps"];
}) {
  const { t } = useI18n();
  return (
    <ol aria-label={t("onboarding_steps")} className="divide-y divide-border">
      {steps.map((step, index) => {
        const [title, hint, Icon] = onboardingLabels[step.id];
        const StatusIcon = stateIcons[step.status];
        return (
          <li
            key={step.id}
            className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2"
            aria-current={step.id === nextStepId ? "step" : undefined}
          >
            <div className="relative mt-2.5 flex size-8 items-center justify-center">
              <StatusIcon
                aria-label={t(onboardingStatuses[step.status])}
                className={`size-6 ${stateTones[step.status]}`}
              />
            </div>
            <details
              open={step.id === nextStepId}
              className="group min-w-0 rounded-md open:bg-info-soft"
            >
              <summary className="flex min-h-12 min-w-0 cursor-pointer list-none items-center gap-2 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="text-sm text-muted-foreground tabular-nums">{index + 1}.</span>
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <h2 className="min-w-0 flex-1 text-base font-medium">{t(title)}</h2>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground group-open:rotate-180"
                />
              </summary>
              <p className="px-2 pb-3 text-sm leading-6 text-muted-foreground">{t(hint)}</p>
            </details>
            <div className="flex min-h-12 flex-wrap items-center justify-end gap-x-4 gap-y-1 sm:gap-x-6">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {t(onboardingStatuses[step.status])}
                {step.count !== null && (
                  <span className="ml-2 tabular-nums">· {step.count.toLocaleString()}</span>
                )}
              </span>
              <a
                href={step.href}
                className="flex min-h-12 items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("onboarding_open")}
                <ArrowRight className="size-4" />
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
