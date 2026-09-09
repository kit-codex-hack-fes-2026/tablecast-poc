import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { GoogleIcon } from "../../components/google-icon";
import { LanguageSwitch } from "../../components/language-switch";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { useI18n } from "../../i18n/locale";

import { authClient, authResult } from "../../lib/auth-client";

function safeReturn() {
  const requested = new URLSearchParams(window.location.search).get("returnTo");
  return requested?.startsWith("/") && !requested.startsWith("//") ? requested : undefined;
}

export function Login() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { t, setLocale } = useI18n();
  const navigate = useNavigate();
  const { returnStoreId, returnDraftId } = useSearch({ from: "/login" });
  const social = useMutation({
    mutationFn: async (method: "google" | "passkey") => {
      const query = new URLSearchParams(searchStr);
      const requested = query.get("returnTo");
      const callbackURL =
        requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/organisations";
      if (method === "passkey") {
        authResult(await authClient.signIn.passkey());
        window.location.assign(query.has("sig") ? `/consent${searchStr}` : callbackURL);
      } else
        authResult(
          await authClient.signIn.social({
            provider: "google",
            callbackURL: query.has("sig") ? `/consent${searchStr}` : callbackURL,
          }),
        );
    },
  });
  useEffect(() => {
    const saved = localStorage.getItem("tablecast_staff_locale");
    if (saved === "ja" || saved === "en") setLocale(saved);
  }, [setLocale]);
  const login = useMutation({
    mutationFn: async (value: { email: string; password: string }) =>
      authResult(await authClient.signIn.email(value)),
    onSuccess: () => {
      if (new URLSearchParams(searchStr).has("sig")) window.location.assign(`/consent${searchStr}`);
      else if (safeReturn()) window.location.assign(safeReturn() ?? "/organisations");
      else
        void navigate({
          to: "/admin/live",
          search: { storeId: returnStoreId, draftId: returnDraftId },
        });
    },
  });
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      await login.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <main className="min-h-dvh flex grid-cols-2 justify-center items-center p-6 max-sm:flex max-sm:flex-col">
      <section className="p-7 flex flex-col items-stretch w-full max-w-144 [&_h2]:text-2xl [&_h2]:-mt-3 [&_h2]:mx-0 [&_h2]:mb-2.5 [&_[data-slot=button][data-size=text]]:justify-center [&_[data-slot=button][data-size=text]]:text-muted-foreground max-sm:py-5 max-sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <Link
            data-ui="brand"
            className="inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight max-lg:text-2xl"
            to="/"
          >
            TableCast<span className="text-accent ml-px text-4xl">·</span>
          </Link>
          <LanguageSwitch
            onChange={(next) => {
              setLocale(next);
              localStorage.setItem("tablecast_staff_locale", next);
            }}
          />
        </header>
        <form
          noValidate
          className="m-auto w-full max-w-96 flex flex-col gap-6 pt-14 px-0 pb-6 max-sm:pt-9"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <h1 className="text-2xl mb-3">{t("auth_subtitle")}</h1>
          <Button
            type="button"
            variant="outline"
            disabled={social.isPending}
            onClick={() => social.mutate("google")}
          >
            <GoogleIcon className="size-5" />
            {t("auth_google")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={social.isPending}
            onClick={() => social.mutate("passkey")}
          >
            {t("auth_passkey")}
          </Button>
          {social.error && (
            <p role="alert" className="text-destructive">
              {t("auth_failed")}
            </p>
          )}
          <form.AppField
            name="email"
            validators={{ onChange: z.email({ error: t("form_email") }) }}
          >
            {(field) => (
              <field.TextField
                label={t("auth_email")}
                type="email"
                autoComplete="username"
                required
                disabled={login.isPending}
              />
            )}
          </form.AppField>
          <form.AppField
            name="password"
            validators={{ onChange: z.string().min(1, t("form_required")) }}
          >
            {(field) => (
              <field.TextField
                label={t("auth_password")}
                type="password"
                autoComplete="current-password"
                required
                disabled={login.isPending}
              />
            )}
          </form.AppField>
          {login.error && (
            <p
              className="text-destructive flex items-start gap-2.5 py-3 px-3.5 rounded-md bg-accent-soft text-base leading-relaxed [&_svg]:shrink-0 [&_svg]:mt-0.5 [&_[data-slot=button][data-size=text]]:min-h-6 [&_[data-slot=button][data-size=text]]:ml-auto [&_[data-slot=button][data-size=text]]:shrink-0"
              role="alert"
            >
              {t("auth_failed")}
            </p>
          )}
          <form.AppForm>
            <form.SubmitButton size="lg" disabled={social.isPending}>
              {t("auth_sign_in")}
              <ArrowRight size={20} aria-hidden="true" />
            </form.SubmitButton>
          </form.AppForm>
          <a className="text-base underline" href={`/register${searchStr}`}>
            {t("auth_register")}
          </a>
          <a className="text-base underline" href="/reset-password">
            {t("auth_reset")}
          </a>
          <Link
            to="/"
            data-slot="button"
            data-size="text"
            className={buttonVariants({ variant: "link", size: "text" })}
          >
            {t("auth_guest")}
          </Link>
        </form>
      </section>
    </main>
  );
}
