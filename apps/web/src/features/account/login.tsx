import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { GoogleIcon } from "../../components/google-icon";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { AuthLayout } from "./auth-layout";
import { loginReturnUrl } from "./login-model";

export function Login({ evaluation = false }: { evaluation?: boolean }) {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { t, setLocale } = useI18n();
  const navigate = useNavigate();
  const { returnStoreId, returnDraftId } = useSearch({ from: "/login" });
  const social = useMutation({
    mutationFn: async (method: "google" | "passkey") => {
      const callbackURL = loginReturnUrl(searchStr, window.location.origin) ?? "/organisations";
      if (method === "passkey") {
        authResult(await authClient.signIn.passkey());
        window.location.assign(callbackURL);
      } else
        authResult(
          await authClient.signIn.social({
            provider: "google",
            callbackURL,
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
      const returnUrl = loginReturnUrl(searchStr, window.location.origin);
      if (returnUrl) window.location.assign(returnUrl);
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
    <AuthLayout
      title={evaluation ? t("evaluation_login_title") : t("auth_subtitle")}
      onLocaleChange={(next) => {
        setLocale(next);
        localStorage.setItem("tablecast_staff_locale", next);
      }}
      footer={
        <>
          <a
            className="inline-flex min-h-11 items-center underline underline-offset-4"
            href={`/register${searchStr}`}
          >
            {t("auth_register")}
          </a>
          <a
            className="inline-flex min-h-11 items-center underline underline-offset-4"
            href="/reset-password"
          >
            {t("auth_reset")}
          </a>
          <Link to="/" className="inline-flex min-h-11 items-center underline underline-offset-4">
            {t("auth_guest")}
          </Link>
        </>
      }
    >
      <form
        noValidate
        className="flex min-w-0 flex-col gap-5 [&_[type=submit]]:w-full"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {evaluation && (
          <aside className="rounded-xl bg-secondary p-5 space-y-3 text-base leading-relaxed">
            <p>{t("evaluation_login_note")}</p>
            <p className="font-semibold">佐藤 晴香 / Haruka Sato</p>
            <p className="break-all text-sm">haruka.sato@komorebi-shijo.com</p>
            <p>{t("evaluation_shared")}</p>
          </aside>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={social.isPending}
          onClick={() => social.mutate("google")}
        >
          <GoogleIcon className="size-5" />
          {evaluation ? t("evaluation_login_button") : t("auth_google")}
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
        <form.AppField name="email" validators={{ onChange: z.email({ error: t("form_email") }) }}>
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
      </form>
    </AuthLayout>
  );
}
