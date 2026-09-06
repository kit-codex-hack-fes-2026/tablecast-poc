import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { LanguageSwitch } from "../../components/language-switch";
import { Button, buttonVariants } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";

export function Login() {
  const { t, setLocale } = useI18n();
  const navigate = useNavigate();
  const { returnStoreId, returnDraftId } = useSearch({ from: "/login" });
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
      else
        void navigate({
          to: "/admin/live",
          search: { storeId: returnStoreId, draftId: returnDraftId },
        });
    },
  });
  return (
    <main className="min-h-dvh flex grid-cols-2 justify-center items-center p-6 max-sm:flex max-sm:flex-col">
      <section className="p-7 flex flex-col items-stretch w-full max-w-144 [&_h2]:text-2xl [&_h2]:-mt-3 [&_h2]:mx-0 [&_h2]:mb-2.5 [&_[data-slot=button][data-size=text]]:justify-center [&_[data-slot=button][data-size=text]]:text-muted-foreground max-sm:py-5 max-sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <Link
            className="brand inline-flex items-baseline font-bold text-2xl tracking-tighter leading-tight max-lg:text-2xl"
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
          className="m-auto w-full max-w-96 flex flex-col gap-6 pt-14 px-0 pb-6 max-sm:pt-9"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <h1 className="text-2xl mb-3">{t("auth_subtitle")}</h1>
          <label className="flex flex-col gap-2 text-xs">
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
          <label className="flex flex-col gap-2 text-xs">
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
            <p
              className="text-destructive flex items-start gap-2.5 py-3 px-3.5 rounded-md bg-accent-soft text-sm leading-relaxed [&_svg]:shrink-0 [&_svg]:mt-0.5 [&_[data-slot=button][data-size=text]]:min-h-6 [&_[data-slot=button][data-size=text]]:ml-auto [&_[data-slot=button][data-size=text]]:shrink-0"
              role="alert"
            >
              {t("auth_failed")}
            </p>
          )}
          <Button
            variant="default"
            size="lg"

            type="submit"
            disabled={login.isPending}
          >
            {t("auth_sign_in")}
            <ArrowRight size={20} aria-hidden="true" />
          </Button>
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
