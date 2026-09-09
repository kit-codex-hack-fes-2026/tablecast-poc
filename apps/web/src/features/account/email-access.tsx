import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { LanguageSwitch } from "../../components/language-switch";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";

import { authClient, authResult } from "../../lib/auth-client";

export function EmailAccess({ register = false }: { register?: boolean }) {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { t, setLocale } = useI18n();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const query = new URLSearchParams(searchStr);
  const token = query.get("token");
  const callbackURL = `/login${searchStr}`;
  const client = useQueryClient();
  const submit = useMutation({
    mutationFn: async () => {
      if (register)
        return authResult(await authClient.signUp.email({ email, password, name, callbackURL }));
      if (token)
        return authResult(await authClient.resetPassword({ newPassword: password, token }));
      return authResult(
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-account"] }),
  });
  return (
    <main className="mx-auto max-w-md space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <a href="/" className="text-2xl font-semibold">
          TableCast
        </a>
        <LanguageSwitch onChange={setLocale} />
      </header>
      <h1 className="text-2xl font-semibold">{t(register ? "auth_register" : "auth_reset")}</h1>
      {submit.isSuccess ? (
        <output>{t(token ? "account_saved" : "auth_check_email")}</output>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          {register && (
            <label className="block">
              {t("account_name")}
              <Input
                required
                value={name}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          {!token && (
            <label className="block">
              {t("auth_email")}
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          {(register || token) && (
            <label className="block">
              {t("auth_password")}
              <Input
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
          <Button type="submit" disabled={submit.isPending}>
            {t(register ? "auth_register" : "auth_reset")}
          </Button>
          {submit.error && (
            <p role="alert" className="text-destructive">
              {t("account_failed")}
            </p>
          )}
        </form>
      )}
      <a className="block text-base underline" href={callbackURL}>
        {t("auth_sign_in")}
      </a>
    </main>
  );
}
