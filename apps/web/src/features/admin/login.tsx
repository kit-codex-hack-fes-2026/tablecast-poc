import { z } from "zod";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";

export function Login() {
  const { t, setLocale } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem("tablecast_staff_locale");
    if (saved === "ja" || saved === "en") setLocale(saved);
  }, [setLocale]);
  const login = useMutation({
    mutationFn: () => {
      const query = new URLSearchParams(window.location.search);
      return api(
        "/api/auth/sign-in/email",
        json("POST", {
          email,
          password,
          ...(query.has("sig") ? { oauth_query: window.location.search.slice(1) } : {}),
        }),
      );
    },
    onSuccess: (result) => {
      const redirected = z
        .object({ redirect: z.literal(true), url: z.string().min(1) })
        .safeParse(result);
      if (redirected.success) window.location.assign(redirected.data.url);
      else void navigate({ to: "/admin/live" });
    },
  });
  return (
    <main className="login-page">
      <section className="login-form-panel">
        <header className="login-header">
          <Link className="brand" to="/">
            TableCast<span>·</span>
          </Link>
          <LanguageSwitch
            onChange={(next) => {
              setLocale(next);
              localStorage.setItem("tablecast_staff_locale", next);
            }}
          />
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <h1>{t("auth_subtitle")}</h1>
          <label>
            {t("auth_email")}
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={login.isPending}
            />
          </label>
          <label>
            {t("auth_password")}
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={login.isPending}
            />
          </label>
          {login.error && (
            <p className="error-notice notice" role="alert">
              {t("auth_failed")}
            </p>
          )}
          <Button
            variant="default"
            size="lg"
            className="primary-button"
            type="submit"
            disabled={login.isPending}
          >
            {t("auth_sign_in")}
            <ArrowRight size={20} aria-hidden="true" />
          </Button>
          <Link to="/" className="text-button">
            {t("auth_guest")}
          </Link>
        </form>
      </section>
    </main>
  );
}
