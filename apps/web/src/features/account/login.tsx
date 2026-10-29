import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useHydrated, useLocation } from "@tanstack/react-router";
import { Fingerprint, Mail } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { GoogleIcon } from "../../components/google-icon";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { authClient, authResult, promptGoogleOneTap } from "../../lib/auth-client";
import { AuthLayout } from "./auth-layout";
import { loginReturnUrl } from "./login-model";

export function Login({ evaluation = false }: { evaluation?: boolean }) {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const joiningVisit =
    new URLSearchParams(searchStr).get("returnTo")?.startsWith("/member/join?") ?? false;
  const { t, locale, setLocale } = useI18n();
  const hydrated = useHydrated();
  const client = useQueryClient();
  const lastMethod = hydrated ? authClient.getLastUsedLoginMethod() : null;
  const callback = (fallback = "/admin/live") =>
    loginReturnUrl(searchStr, window.location.origin) ?? fallback;
  const registrationCallback = (fallback = "/organisations") => {
    const destination = new URL(callback(fallback), window.location.origin);
    return `${window.location.origin}/passkey-setup?${new URLSearchParams({ returnTo: destination.pathname + destination.search + destination.hash }).toString()}`;
  };
  useEffect(() => {
    const saved = localStorage.getItem("tablecast_staff_locale");
    if (saved === "ja" || saved === "en") setLocale(saved);
    let active = true;
    void parseResponse(rpc.api.account["auth-config"].$get())
      .then(async (config) => {
        if (!active || !config.googleOneTapClientId) return;
        const session = await authClient.getSession();
        if (active && !session.data)
          await promptGoogleOneTap(
            config.googleOneTapClientId,
            loginReturnUrl(searchStr, window.location.origin) ?? "/organisations",
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [setLocale, searchStr]);
  const social = useMutation({
    mutationFn: async (method: "google" | "passkey") => {
      if (method === "passkey") {
        authResult(await authClient.signIn.passkey());
        window.location.assign(callback("/organisations"));
      } else
        authResult(
          await authClient.signIn.social({
            provider: "google",
            callbackURL: callback("/organisations"),
            newUserCallbackURL: registrationCallback(),
          }),
        );
    },
  });
  const login = useMutation({
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-session"] }),
    mutationFn: async ({ email }: { email: string }) =>
      authResult(
        await authClient.signIn.magicLink({
          email,
          metadata: { locale },
          callbackURL: callback(),
          newUserCallbackURL: registrationCallback("/admin/live"),
          errorCallbackURL: `/login${searchStr}`,
        }),
      ),
  });
  const form = useAppForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      await login.mutateAsync(value).catch(() => undefined);
    },
  });
  const last = (method: string) =>
    lastMethod === method ? <Badge variant="secondary">{t("auth_last_used")}</Badge> : null;
  return (
    <AuthLayout
      title={
        evaluation
          ? t("evaluation_login_title")
          : joiningVisit
            ? t("customer_login_title")
            : t("auth_subtitle")
      }
      onLocaleChange={(next) => {
        setLocale(next);
        localStorage.setItem("tablecast_staff_locale", next);
      }}
      footer={
        <Link to="/" className="inline-flex min-h-11 items-center underline underline-offset-4">
          {t("auth_guest")}
        </Link>
      }
    >
      <div className="space-y-6">
        {joiningVisit && (
          <p className="leading-relaxed text-muted-foreground">{t("customer_login_hint")}</p>
        )}
        {new URLSearchParams(searchStr).has("error") && (
          <p role="alert" className="text-destructive">
            {t("auth_magic_invalid")}
          </p>
        )}
        {evaluation && (
          <aside className="rounded-xl bg-secondary p-5 text-base leading-relaxed">
            {t("evaluation_login_note")}
          </aside>
        )}
        <Button
          variant="outline"
          className="w-full"
          disabled={social.isPending}
          onClick={() => social.mutate("google")}
        >
          <GoogleIcon className="size-5" />
          {evaluation ? t("evaluation_login_button") : t("auth_google")}
          {last("google")}
        </Button>
        <Button
          className="w-full"
          size="lg"
          disabled={social.isPending}
          onClick={() => social.mutate("passkey")}
        >
          <Fingerprint className="size-6" />
          {t("auth_passkey")}
          {last("passkey")}
        </Button>
        {social.error && (
          <p role="alert" className="text-destructive">
            {t("auth_failed")}
          </p>
        )}
        <hr className="border-border" />
        <form.AppForm>
          <form.Form noValidate className="space-y-5 [&_[type=submit]]:w-full">
            <form.AppField
              name="email"
              validators={{ onChange: z.email({ error: t("form_email") }) }}
            >
              {(field) => (
                <field.TextField
                  label={t("auth_email")}
                  type="email"
                  autoComplete="email"
                  required
                  disabled={login.isPending}
                />
              )}
            </form.AppField>
            <form.SubmitButton variant="outline" disabled={social.isPending}>
              <Mail />
              {t("auth_send_magic_link")}
              {last("magic-link")}
            </form.SubmitButton>
            {login.isSuccess && <output className="block text-sm">{t("auth_magic_sent")}</output>}
            {login.error && (
              <p role="alert" className="text-destructive">
                {t("account_failed")}
              </p>
            )}
          </form.Form>
        </form.AppForm>
      </div>
    </AuthLayout>
  );
}
