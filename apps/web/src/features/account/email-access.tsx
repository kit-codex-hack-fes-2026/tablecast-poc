import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { LanguageSwitch } from "../../components/language-switch";
import { useI18n } from "../../i18n/locale";

import { authClient, authResult } from "../../lib/auth-client";

export function EmailAccess({ register = false }: { register?: boolean }) {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const { t, setLocale } = useI18n();
  const query = new URLSearchParams(searchStr);
  const token = query.get("token");
  const callbackURL = `/login${searchStr}`;
  const client = useQueryClient();
  const submit = useMutation({
    mutationFn: async ({
      email,
      name,
      password,
    }: {
      email: string;
      name: string;
      password: string;
    }) => {
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
  const form = useAppForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      await submit.mutateAsync(value).catch(() => undefined);
    },
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
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          {register && (
            <form.AppField
              name="name"
              validators={{ onChange: z.string().trim().min(1, t("form_required")) }}
            >
              {(field) => (
                <field.TextField label={t("account_name")} autoComplete="name" required />
              )}
            </form.AppField>
          )}
          {!token && (
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
                />
              )}
            </form.AppField>
          )}
          {(register || token) && (
            <form.AppField
              name="password"
              validators={{ onChange: z.string().min(12, t("form_password")) }}
            >
              {(field) => (
                <field.TextField
                  label={t("auth_password")}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              )}
            </form.AppField>
          )}
          <form.AppForm>
            <form.SubmitButton>{t(register ? "auth_register" : "auth_reset")}</form.SubmitButton>
          </form.AppForm>
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
