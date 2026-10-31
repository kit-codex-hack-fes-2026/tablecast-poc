import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { Fingerprint, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { sessionOptions } from "../../lib/session-query";
import { AuthLayout } from "./auth-layout";
import { loginReturnUrl } from "./login-model";

const reminderKey = (userId: string) => `tablecast.passkey-reminder:${userId}`;
function deferReminder(userId: string) {
  localStorage.setItem(reminderKey(userId), String(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

export function PasskeySetup() {
  const { t } = useI18n();
  const search = useLocation({ select: (location) => location.searchStr });
  const session = useQuery(sessionOptions);
  const complete = () => {
    if (session.data) deferReminder(session.data.user.id);
    window.location.assign(loginReturnUrl(search, window.location.origin) ?? "/organisations");
  };
  return (
    <AuthLayout title={t("auth_passkey_title")}>
      <PasskeyRegistration onComplete={complete} onSkip={complete} />
    </AuthLayout>
  );
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function PasskeyPrompt() {
  const { t } = useI18n();
  const { data: session } = useQuery(sessionOptions);
  const [dismissed, setDismissed] = useState<string>();
  const userId = session?.user.id;
  const registered = session?.user.passkeyRegistered;
  const due = useSyncExternalStore(
    subscribeStorage,
    () =>
      Boolean(
        userId &&
        !registered &&
        Number(localStorage.getItem(reminderKey(userId)) ?? 0) <= Date.now(),
      ),
    () => false,
  );
  const open = due && dismissed !== userId;
  const close = () => {
    if (userId) deferReminder(userId);
    setDismissed(userId);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("auth_passkey_title")}</DialogTitle>
          <DialogClose aria-label={t("common_close")}>
            <X />
          </DialogClose>
        </DialogHeader>
        <PasskeyRegistration onComplete={close} onSkip={close} />
      </DialogContent>
    </Dialog>
  );
}

function PasskeyRegistration({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const register = useMutation({
    mutationFn: async () => authResult(await authClient.passkey.addPasskey({ name: "TableCast" })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: sessionOptions.queryKey });
      onComplete();
    },
  });
  return (
    <section className="space-y-5">
      <Fingerprint className="size-12 text-primary" aria-hidden="true" />
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
      <Button variant="outline" className="w-full" disabled={register.isPending} onClick={onSkip}>
        {t("auth_passkey_later")}
      </Button>
    </section>
  );
}
