import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { Brand } from "../../components/brand";
import { LanguageSwitch } from "../../components/language-switch";
import { buttonVariants } from "../../components/ui/button-variants";
import { useI18n } from "../../i18n/locale";
import { LandingDevice } from "./landing-device";

function StoreAction() {
  const { t } = useI18n();
  return (
    <Link
      to="/admin/live"
      data-slot="button"
      data-size="lg"
      className={buttonVariants({ size: "lg" })}
    >
      {t("landing_app_store_action")}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function DocumentationLink() {
  const { t, locale } = useI18n();
  return (
    <Link
      to="/help/$lang/$"
      params={{ lang: locale === "ja" ? "ja" : "en", _splat: "" }}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
    >
      {t("help_title")}
      <ArrowUpRight aria-hidden="true" className="size-4" />
    </Link>
  );
}

export function Landing() {
  const { t, setLocale } = useI18n();
  const scenes = [
    {
      image: "consult",
      title: t("landing_case_sake_title"),
      steps: [
        t("landing_case_sake_start"),
        t("landing_case_sake_action"),
        t("landing_case_sake_outcome"),
      ],
      alt: t("landing_scene_consult_alt"),
      screen: "order-menu",
      screenAlt: t("landing_order_image_alt"),
      width: 1024,
      height: 768,
    },
    {
      image: "tourists",
      title: t("landing_case_tourists_title"),
      steps: [
        t("landing_case_tourists_start"),
        t("landing_case_tourists_action"),
        t("landing_case_tourists_outcome"),
      ],
      alt: t("landing_case_tourists_alt"),
      screen: "dish-detail",
      screenAlt: t("landing_case_food_screen_alt"),
      width: 1024,
      height: 768,
    },
    {
      image: "elderly",
      title: t("landing_case_elderly_title"),
      steps: [
        t("landing_case_elderly_start"),
        t("landing_case_elderly_action"),
        t("landing_case_elderly_outcome"),
      ],
      alt: t("landing_case_elderly_alt"),
      screen: "order-menu",
      screenAlt: t("landing_order_image_alt"),
      width: 1024,
      height: 768,
    },
    {
      image: "setup",
      title: t("landing_case_setup_title"),
      steps: [
        t("landing_case_setup_start"),
        t("landing_case_setup_action"),
        t("landing_case_setup_outcome"),
      ],
      alt: t("landing_case_setup_alt"),
      screen: "plugin",
      screenAlt: t("landing_case_plugin_screen_alt"),
      width: 1096,
      height: 762,
    },
    {
      image: "handoff",
      title: t("landing_case_handoff_title"),
      steps: [
        t("landing_case_handoff_start"),
        t("landing_case_handoff_action"),
        t("landing_case_handoff_outcome"),
      ],
      alt: t("landing_case_handoff_alt"),
      screen: "handoff",
      screenAlt: t("landing_case_handoff_screen_alt"),
      width: 1096,
      height: 312,
    },
  ];
  const questions = [
    { question: t("landing_faq_touch"), answer: t("landing_faq_touch_answer") },
    { question: t("landing_faq_confirmation"), answer: t("landing_faq_confirmation_answer") },
    { question: t("landing_faq_language"), answer: t("landing_faq_language_answer") },
    { question: t("landing_faq_pause"), answer: t("landing_faq_pause_answer") },
    { question: t("landing_faq_plan"), answer: t("landing_faq_plan_answer") },
  ];
  return (
    <div className="bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 sm:px-8 sm:py-4">
          <Link to="/" aria-label="TableCast" className="mr-auto inline-flex shrink-0 items-center">
            <Brand className="w-32" />
          </Link>
          <nav
            aria-label={t("landing_navigation")}
            className="hidden items-center gap-6 text-sm font-medium lg:flex"
          >
            <a href="#operations" className="inline-flex min-h-11 items-center hover:underline">
              {t("landing_nav_operations")}
            </a>
            <a href="#conversation" className="inline-flex min-h-11 items-center hover:underline">
              {t("landing_nav_guest")}
            </a>
            <DocumentationLink />
          </nav>
          <div className="order-last flex w-full justify-end sm:order-0 sm:w-auto">
            <LanguageSwitch onChange={setLocale} />
          </div>
          <Link
            to="/login"
            data-slot="button"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("auth_sign_in")}
          </Link>
        </div>
      </header>
      <main>
        <section
          aria-labelledby="tablecast-landing-title"
          className="mx-auto max-w-7xl px-5 py-6 sm:p-8"
        >
          <div className="grid items-center gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:gap-6">
            <div>
              <h1
                id="tablecast-landing-title"
                className="text-3xl leading-snug tracking-tight whitespace-pre-line min-[360px]:text-4xl sm:text-5xl"
              >
                {t("landing_title")}
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-pretty whitespace-pre-line sm:text-lg">
                {t("landing_description")}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                <StoreAction />
                <DocumentationLink />
              </div>
            </div>
            <figure className="min-w-0" aria-label={t("landing_screen_caption")}>
              <div className="relative aspect-7/4">
                <div className="absolute top-0 right-0 w-[85%]">
                  <LandingDevice
                    device="laptop"
                    src="/landing/manage-products.webp"
                    width={1440}
                    height={900}
                    loading="eager"
                    alt={t("landing_products_image_alt")}
                  />
                </div>
                <div className="absolute bottom-0 left-0 w-[50%]">
                  <LandingDevice
                    device="tablet"
                    src="/landing/order-menu.webp"
                    width={1024}
                    height={768}
                    loading="eager"
                    alt={t("landing_order_image_alt")}
                  />
                </div>
                <div className="absolute right-[1%] bottom-0 w-[17%]">
                  <LandingDevice
                    device="phone"
                    src="/landing/member-home.webp"
                    width={402}
                    height={844}
                    loading="eager"
                    alt={t("landing_member_image_alt")}
                  />
                </div>
              </div>
            </figure>
          </div>
          <nav
            aria-label={t("landing_apps_navigation")}
            className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-1 border-t border-border pt-2 text-sm"
          >
            <Link
              to="/pair"
              className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
            >
              {t("landing_app_terminal_action")}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              to="/member"
              className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
            >
              {t("landing_app_member_action")}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </nav>
        </section>

        <section
          aria-labelledby="tablecast-plugin-title"
          className="border-y border-border bg-muted p-5 sm:px-8"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-3 md:grid-cols-[1fr_1.4fr_auto] md:gap-6">
            <h2
              id="tablecast-plugin-title"
              className="text-xl leading-snug whitespace-pre-line sm:text-2xl"
            >
              {t("landing_plugin_title")}
            </h2>
            <p className="text-sm leading-relaxed">{t("landing_plugin_body")}</p>
            <DocumentationLink />
          </div>
        </section>

        <section
          id="conversation"
          aria-labelledby="tablecast-conversation-title"
          className="scroll-mt-6 bg-background px-5 py-8 sm:px-8 sm:py-10"
        >
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2
                id="tablecast-conversation-title"
                className="text-3xl leading-snug tracking-tight whitespace-pre-line sm:text-4xl"
              >
                {t("landing_conversation_title")}
              </h2>
              <p className="max-w-md text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {t("landing_conversation_body")}
              </p>
            </div>
            <div className="mt-6 divide-y divide-border">
              {scenes.map((scene) => (
                <article
                  key={scene.image}
                  className="grid items-center gap-5 py-6 md:grid-cols-2 lg:grid-cols-[0.85fr_0.85fr_1fr] lg:gap-6"
                >
                  <img
                    src={`/landing/scene-${scene.image}.webp`}
                    width={1024}
                    height={683}
                    loading="lazy"
                    alt={scene.alt}
                    className="aspect-3/2 w-full rounded-lg object-cover"
                  />
                  <div>
                    <h3 className="text-xl leading-snug whitespace-pre-line">{scene.title}</h3>
                    <ul className="mt-4 space-y-3 border-l-2 border-border pl-4 text-sm leading-relaxed">
                      {scene.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                  <figure className="min-w-0 md:col-span-2 md:mx-auto md:w-3/4 lg:col-span-1 lg:w-full">
                    <img
                      src={`/landing/${scene.screen}.webp`}
                      width={scene.width}
                      height={scene.height}
                      loading="lazy"
                      alt={scene.screenAlt}
                      className="w-full rounded-lg border border-border shadow-sm"
                    />
                  </figure>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="operations"
          aria-labelledby="tablecast-operations-title"
          className="mx-auto grid max-w-7xl scroll-mt-6 items-center gap-7 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-8"
        >
          <figure className="min-w-0 max-lg:order-last">
            <LandingDevice
              device="laptop"
              src="/landing/manage-products.webp"
              width={1440}
              height={900}
              alt={t("landing_products_image_alt")}
            />
          </figure>
          <div>
            <h2
              id="tablecast-operations-title"
              className="text-3xl leading-snug tracking-tight whitespace-pre-line sm:text-4xl"
            >
              {t("landing_operations_title")}
            </h2>
            <p className="mt-4 text-base leading-relaxed whitespace-pre-line">
              {t("landing_operations_body")}
            </p>
            <dl className="mt-6 space-y-5">
              <div>
                <dt className="font-semibold">{t("landing_menu_title")}</dt>
                <dd className="mt-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  {t("landing_menu_body")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{t("landing_mcp_title")}</dt>
                <dd className="mt-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  {t("landing_mcp_body")}
                </dd>
              </div>
            </dl>
            <div className="mt-5">
              <StoreAction />
            </div>
          </div>
        </section>

        <section
          aria-labelledby="tablecast-member-title"
          className="mx-auto grid max-w-7xl gap-6 border-b border-border px-5 py-8 sm:px-8 sm:py-10 md:grid-cols-2 md:gap-8"
        >
          <div>
            <h2
              id="tablecast-member-title"
              className="text-3xl leading-snug tracking-tight whitespace-pre-line sm:text-4xl"
            >
              {t("landing_member_title")}
            </h2>
            <Link
              to="/member"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t("landing_app_member_action")}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="space-y-5">
            <div>
              <h3>{t("landing_member_visits")}</h3>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {t("landing_member_visits_body")}
              </p>
            </div>
            <div>
              <h3>{t("landing_member_rewards")}</h3>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {t("landing_member_rewards_body")}
              </p>
            </div>
            <div>
              <h3>{t("landing_member_preferences")}</h3>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {t("landing_member_preferences_body")}
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="tablecast-faq-title"
          className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 sm:py-10 md:grid-cols-[1fr_2fr] md:gap-8"
        >
          <h2 id="tablecast-faq-title" className="text-2xl sm:text-3xl">
            {t("landing_faq_title")}
          </h2>
          <div className="border-t border-border">
            {questions.map(({ question, answer }) => (
              <details key={question} className="group border-b border-border">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  {question}
                  <Plus aria-hidden="true" className="size-4 shrink-0 group-open:rotate-45" />
                </summary>
                <p className="pb-5 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="tablecast-start-title"
          className="bg-muted px-5 py-10 sm:px-8 sm:py-12"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6">
            <div>
              <h2
                id="tablecast-start-title"
                className="text-3xl leading-snug tracking-tight whitespace-pre-line sm:text-4xl"
              >
                {t("landing_start_title")}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {t("landing_setup_body")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <StoreAction />
              <DocumentationLink />
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Link to="/" aria-label="TableCast">
          <Brand className="w-28" />
        </Link>
        <p className="text-sm text-muted-foreground">{t("landing_footer")}</p>
        <DocumentationLink />
      </footer>
    </div>
  );
}
