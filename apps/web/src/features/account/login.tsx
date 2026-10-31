import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useHydrated, useLocation } from "@tanstack/react-router";
import { Fingerprint, Info, Mail } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";
import type { MemberLoginBranding } from "./member-login-query";
import { useAppForm } from "../../components/form";
import { GoogleIcon } from "../../components/google-icon";
import { StoreLogo } from "../../components/store-logo";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { authClient, authResult, promptGoogleOneTap } from "../../lib/auth-client";
import { AuthLayout } from "./auth-layout";
import { loginReturnUrl } from "./login-model";

export function Login({ memberStore }: { memberStore?: MemberLoginBranding }) {
  const searchStr = useLocation({ select: (location) => location.searchStr });
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
    <LoginLayout
      memberStore={memberStore}
      searchStr={searchStr}
      onLocaleChange={(next) => {
        setLocale(next);
        localStorage.setItem("tablecast_staff_locale", next);
      }}
    >
      <div className="space-y-6">
        {new URLSearchParams(searchStr).has("error") && (
          <p role="alert" className="text-destructive">
            {t("auth_magic_invalid")}
          </p>
        )}
        <Button
          variant="outline"
          className="w-full"
          disabled={social.isPending}
          onClick={() => social.mutate("google")}
        >
          <GoogleIcon className="size-5" />
          {t("auth_google")}
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
    </LoginLayout>
  );
}

function LoginLayout({
  memberStore,
  searchStr,
  onLocaleChange,
  children,
}: {
  children: ReactNode;
  memberStore?: MemberLoginBranding;
  onLocaleChange: (locale: "en" | "ja") => void;
  searchStr: string;
}) {
  const { t } = useI18n();
  const memberDestination = new URLSearchParams(searchStr).get("returnTo");
  const joiningVisit = memberDestination?.startsWith("/member/join?") ?? false;
  const memberSignIn =
    memberDestination === "/member" || memberDestination?.startsWith("/member/") === true;
  return (
    <AuthLayout
      brand={
        memberSignIn && memberStore?.logo ? (
          <StoreLogo
            logo={memberStore.logo}
            imageBasePath={`/api/member-stores/${encodeURIComponent(memberStore.storeId)}/images`}
            width={160}
            height={40}
          />
        ) : undefined
      }
      eyebrow={memberSignIn ? memberStore?.storeName : undefined}
      title={
        joiningVisit
          ? t("customer_login_title")
          : memberSignIn
            ? t("customer_member_login_title")
            : t("auth_subtitle")
      }
      onLocaleChange={onLocaleChange}
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
        {memberSignIn && !joiningVisit && (
          <p className="leading-relaxed text-muted-foreground">{t("customer_member_login_hint")}</p>
        )}
        {children}
        {!memberSignIn && ["development", "preview", "staging"].includes(import.meta.env.MODE) && (
          <LoginDemoTips />
        )}
      </div>
    </AuthLayout>
  );
}

function LoginDemoTips() {
  const { t } = useI18n();
  return (
    <aside
      aria-labelledby="login-demo-tips-title"
      className="space-y-4 rounded-xl border border-info-border bg-info-surface p-5 text-sm leading-relaxed text-info-text"
    >
      <h2 id="login-demo-tips-title" className="flex items-center gap-2 font-semibold">
        <Info aria-hidden="true" className="size-5 shrink-0" />
        {t("auth_demo_title")}
      </h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          {t("auth_demo_sign_in")}
          <span className="block break-all">haruka.sato@komorebi-shijo.com</span>
        </li>
        <li>{t("auth_demo_select_store")}</li>
      </ol>
      <section className="space-y-1">
        <h3 className="font-semibold">{t("auth_demo_voice_title")}</h3>
        <p>{t("auth_demo_voice_steps")}</p>
      </section>
      <section className="space-y-1">
        <h3 className="font-semibold">{t("auth_demo_plugin_title")}</h3>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t("auth_demo_plugin_connect")}</li>
          <li>{t("auth_demo_plugin_approve")}</li>
        </ol>
        <Link
          to="/account/integrations/plugins"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("auth_demo_integration_link")}
        </Link>
      </section>
    </aside>
  );
}
