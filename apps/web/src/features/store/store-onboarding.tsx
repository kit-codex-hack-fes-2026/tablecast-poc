import { useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardCheck, KeyRound, ShieldCheck, Tablet } from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { useI18n } from "../../i18n/locale";
import { KnowledgeSetupBanner } from "../configuration/store-knowledge-setup-banner";
import { OnboardingProgress } from "./onboarding-progress";
import { onboardingOptions } from "./onboarding-query";
import { OnboardingSteps } from "./onboarding-steps";
import { useStore } from "./store-context";

export function StoreOnboarding({ draftId }: { draftId?: string }) {
  const store = useStore();
  const { t } = useI18n();
  const progress = useSuspenseQuery(onboardingOptions(store.id, draftId));
  const next = progress.data.steps.find((step) => step.id === progress.data.progress.nextStepId);
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title={t("onboarding_title")}
        description={t("onboarding_description")}
        icon={<ClipboardCheck />}
      />
      <ErrorNotice query={progress} retrying={progress.isFetching} />
      <KnowledgeSetupBanner storeId={store.id} draftId={draftId} />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <OnboardingProgress
          value={progress.data.progress}
          refreshing={progress.isFetching}
          onRefresh={() => void progress.refetch()}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t("onboarding_steps")}</h2>
          {next && (
            <a
              href={next.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-info-border px-3 text-sm font-medium text-info-text hover:bg-info-soft"
            >
              <ShieldCheck className="size-4" />
              {t("onboarding_next")}
            </a>
          )}
        </div>
        <OnboardingSteps
          steps={progress.data.steps}
          nextStepId={progress.data.progress.nextStepId}
        />
      </div>
      <details className="group rounded-lg border border-border px-4 py-3">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="size-4" />
          {t("onboarding_human_checks")}
          <span className="ml-auto flex items-center gap-3 text-muted-foreground">
            <KeyRound className="size-4" />
            <Tablet className="size-4" />
          </span>
        </summary>
        <p className="pb-2 text-sm leading-6 text-muted-foreground">{t("onboarding_human_hint")}</p>
      </details>
    </div>
  );
}
