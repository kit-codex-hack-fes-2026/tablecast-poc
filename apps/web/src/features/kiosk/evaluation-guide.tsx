import { ArrowRight, MessagesSquare, MonitorSmartphone } from "lucide-react";
import { buttonVariants } from "../../components/ui/button-variants";
import { useI18n } from "../../i18n/locale";

export function EvaluationGuide() {
  const { t } = useI18n();
  const steps = [
    { title: t("evaluation_step1_title"), body: t("evaluation_step1") },
    { title: t("evaluation_step2_title"), body: t("evaluation_step2") },
    { title: t("evaluation_step3_title"), body: t("evaluation_step3") },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-12 px-6 pt-8 pb-12 sm:px-9 sm:pt-14">
      <section className="grid items-start gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <p className="text-sm font-semibold text-muted-foreground">{t("evaluation_badge")}</p>
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t("evaluation_title")}
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">{t("evaluation_intro")}</p>
          <a
            className={buttonVariants({
              size: "lg",
              className: "h-auto min-h-14 whitespace-normal py-3",
            })}
            href="/login?returnTo=%2Fadmin%2Fstores%2Ftablecast-komorebi%2Fdemo"
          >
            {t("evaluation_start")}
            <ArrowRight aria-hidden="true" />
          </a>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("evaluation_start_note")}
          </p>
        </div>
        <aside className="space-y-5 rounded-2xl bg-secondary p-6 sm:p-8">
          <h2 className="flex items-center gap-3 text-lg font-semibold">
            <MessagesSquare aria-hidden="true" className="size-6 shrink-0" />
            {t("evaluation_try_title")}
          </h2>
          <ul className="space-y-3">
            {[t("evaluation_try1"), t("evaluation_try2"), t("evaluation_try3")].map((phrase) => (
              <li
                key={phrase}
                className="w-fit rounded-2xl rounded-bl-sm border border-border bg-card px-5 py-3 text-base"
              >
                {phrase}
              </li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("evaluation_controls")}
          </p>
        </aside>
      </section>
      <section className="space-y-6" aria-labelledby="evaluation-steps">
        <h2 id="evaluation-steps" className="text-2xl font-semibold">
          {t("evaluation_steps")}
        </h2>
        <ol className="grid gap-7 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="space-y-3 border-t border-border pt-5">
              <span className="text-sm font-semibold text-muted-foreground" aria-hidden="true">
                0{index + 1}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-base leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-4 rounded-2xl border border-border p-6 sm:p-8">
        <h2 className="flex items-center gap-3 text-xl font-semibold">
          <MonitorSmartphone aria-hidden="true" className="size-6 shrink-0" />
          {t("evaluation_staff_title")}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">{t("evaluation_staff")}</p>
        <a
          className={buttonVariants({
            variant: "outline",
            className: "h-auto min-h-12 whitespace-normal py-3",
          })}
          href="/login?returnTo=%2Fadmin%2Fstores%2Ftablecast-komorebi%2Ffloor"
        >
          {t("evaluation_staff_link")}
          <ArrowRight aria-hidden="true" />
        </a>
      </section>
      <footer className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>{t("evaluation_safety")}</p>
        <p>{t("evaluation_shared")}</p>
      </footer>
    </div>
  );
}
