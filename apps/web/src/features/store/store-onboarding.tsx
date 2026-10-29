import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileWarning,
  Link2,
  Palette,
  Puzzle,
  Radio,
  ShieldCheck,
  Sparkles,
  Tags,
  UtensilsCrossed,
} from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { onboardingOptions } from "./onboarding-query";
import { useStore } from "./store-context";

const labels = {
  identity: ["onboarding_identity", "onboarding_identity_hint", Tags],
  menu: ["onboarding_menu", "onboarding_menu_hint", UtensilsCrossed],
  options: ["onboarding_options", "onboarding_options_hint", Tags],
  appearance: ["onboarding_appearance", "onboarding_appearance_hint", Palette],
  cast: ["onboarding_cast", "onboarding_cast_hint", Radio],
  knowledge: ["knowledge_title", "onboarding_knowledge_hint", BookOpenCheck],
  rewards: ["onboarding_rewards", "onboarding_rewards_hint", Sparkles],
  games: ["onboarding_games", "onboarding_games_hint", Puzzle],
  publication: ["onboarding_publication", "onboarding_publication_hint", ShieldCheck],
} as const;
const statuses = {
  configured: "onboarding_configured",
  missing: "onboarding_missing",
  invalid: "onboarding_invalid",
  review: "onboarding_review",
  optional: "onboarding_optional",
} as const;
export function StoreOnboarding({ draftId }: { draftId?: string }) {
  const store = useStore();
  const { t } = useI18n();
  const progress = useSuspenseQuery(onboardingOptions(store.id, draftId));
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title={t("onboarding_title")}
        description={t("onboarding_description")}
        icon={<ClipboardCheck />}
        actions={
          <Button
            nativeButton={false}
            render={<Link to="/account/integrations/plugins" />}
            variant="outline"
          >
            <Link2 />
            {t("home_plugin_cta")}
          </Button>
        }
      />
      <ErrorNotice query={progress} retrying={progress.isFetching} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info-border p-4">
        <p className="max-w-3xl text-sm text-muted-foreground">{t("onboarding_agent_hint")}</p>
        <code className="rounded border border-border px-2 py-1 font-mono text-xs">
          get_store_onboarding
        </code>
      </div>
      <ol className="grid min-w-0 gap-3 lg:grid-cols-2">
        {progress.data.steps.map((step, index) => {
          const [title, hint, Icon] = labels[step.id];
          const StatusIcon =
            step.status === "configured"
              ? CheckCircle2
              : step.status === "invalid"
                ? FileWarning
                : CircleHelp;
          return (
            <li key={step.id} className="min-w-0 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Icon className="size-5 shrink-0 text-nav-menu" />
                <h2 className="min-w-0 flex-1 font-semibold">
                  {index + 1}. {t(title)}
                </h2>
                <span
                  className={`flex shrink-0 items-center gap-1 text-xs ${step.status === "configured" ? "text-success" : step.status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  <StatusIcon className="size-4" />
                  {t(statuses[step.status])}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(hint)}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("onboarding_count")} · {step.count.toLocaleString()}
                </span>
                <a
                  href={step.href}
                  className="flex min-h-11 items-center gap-1 text-sm font-medium text-info-text underline-offset-4 hover:underline"
                >
                  {t("onboarding_open")}
                  <ArrowRight className="size-4" />
                </a>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="rounded-lg border border-border p-4 text-sm leading-6 text-muted-foreground">
        {t("onboarding_human_hint")}
      </p>
    </div>
  );
}
