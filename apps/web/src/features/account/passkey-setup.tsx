import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { Fingerprint, LogOut } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { sessionOptions } from "../../lib/session-query";
import { AuthLayout } from "./auth-layout";
import { loginReturnUrl } from "./login-model";

export function PasskeySetup() {
  const { t } = useI18n();
  const search = useLocation({ select: (location) => location.searchStr });
  const client = useQueryClient();
  const register = useMutation({
    mutationFn: async () => {
      authResult(await authClient.passkey.addPasskey({ name: "TableCast" }));
      const session = await client.fetchQuery({ ...sessionOptions, staleTime: 0 });
      if (!session || session.passkeyRequired) throw new Error("PASSKEY_REGISTRATION_REQUIRED");
      window.location.assign(loginReturnUrl(search, window.location.origin) ?? "/organisations");
    },
  });
  return (
    <AuthLayout title={t("auth_passkey_required")}>
      <section className="space-y-6 rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <Fingerprint className="size-16 text-primary" aria-hidden="true" />
        <p className="leading-relaxed">{t("auth_passkey_setup_description")}</p>
        <Button
          size="lg"
          className="w-full"
          disabled={register.isPending}
          onClick={() => register.mutate()}
        >
          <Fingerprint className="size-6" />
          {t("account_add_passkey")}
        </Button>
        {register.error && (
          <p role="alert" className="text-destructive">
            {t("auth_passkey_setup_failed")}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{t("auth_passkey_supported_device")}</p>
        <Button
          variant="ghost"
          disabled={register.isPending}
          onClick={() => {
            void authClient.signOut().then(() => window.location.assign("/login"));
          }}
        >
          <LogOut />
          {t("auth_sign_out")}
        </Button>
      </section>
    </AuthLayout>
  );
}
