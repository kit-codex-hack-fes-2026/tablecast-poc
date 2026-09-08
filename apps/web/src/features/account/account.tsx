import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ImagePlus,
  KeyRound,
  Link2,
  LogOut,
  Monitor,
  Plus,
  ShieldCheck,
  Trash2,
  Unlink,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { GoogleIcon } from "../../components/google-icon";
import { UserIdentity } from "../../components/user-identity";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { SettingsShell } from "./settings-shell";

export function Account() {
  const { t, locale } = useI18n();
  const session = authClient.useSession();
  const client = useQueryClient();
  const [name, setName] = useState<string>();
  const [passkeyName, setPasskeyName] = useState("");
  const sessions = useQuery({
    queryKey: ["tablecast-account", "sessions"],
    queryFn: async () => authResult(await authClient.listSessions()),
    enabled: !!session.data,
  });
  const accounts = useQuery({
    queryKey: ["tablecast-account", "links"],
    queryFn: async () => authResult(await authClient.listAccounts()),
    enabled: !!session.data,
  });
  const keys = useQuery({
    queryKey: ["tablecast-account", "passkeys"],
    queryFn: async () => authResult(await authClient.passkey.listUserPasskeys()),
    enabled: !!session.data,
  });
  const change = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-account"] });
      void session.refetch();
    },
  });
  const section = "space-y-5 rounded-2xl border border-border bg-white p-4 sm:p-5";
  return (
    <SettingsShell>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("account_title")}</h1>
        <output className="flex min-h-6 items-center gap-2 text-base" aria-live="polite">
          {change.isSuccess && (
            <>
              <Check className="size-5" />
              {t("account_saved")}
            </>
          )}
        </output>
      </div>
      {(change.error || sessions.error || accounts.error || keys.error) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive"
        >
          {t("account_failed")}
        </p>
      )}
      <section className={section}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserRound className="size-5" />
          {t("account_profile")}
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          {session.data && <UserIdentity user={session.data.user} />}
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-white px-4 hover:bg-secondary focus-within:outline-3 focus-within:outline-offset-2">
            <ImagePlus className="size-5" />
            {t("account_avatar")}
            <input
              className="sr-only"
              type="file"
              disabled={change.isPending}
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                change.mutate(async () => {
                  const body = new FormData();
                  body.set("image", file);
                  const response = await fetch("/api/account/avatar", { method: "POST", body });
                  if (!response.ok) throw new Error("UPLOAD_FAILED");
                });
              }}
            />
          </label>
        </div>
        <form
          className="flex max-w-2xl flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate(async () =>
              authResult(
                await authClient.updateUser({ name: name ?? session.data?.user.name ?? "" }),
              ),
            );
          }}
        >
          <label className="min-w-48 flex-1 space-y-2">
            {t("account_name")}
            <Input
              required
              maxLength={100}
              value={name ?? session.data?.user.name ?? ""}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={change.isPending}>
            {t("account_save")}
          </Button>
        </form>
        {!session.data?.user.emailVerified && (
          <Button
            variant="outline"
            disabled={change.isPending}
            onClick={() =>
              change.mutate(async () =>
                authResult(
                  await authClient.sendVerificationEmail({
                    email: session.data?.user.email ?? "",
                    callbackURL: "/account",
                  }),
                ),
              )
            }
          >
            <ShieldCheck />
            {t("account_verify")}
          </Button>
        )}
      </section>
      <section className={section}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Link2 className="size-5" />
          {t("account_connections")}
        </h2>
        <div className="min-h-20" aria-busy={accounts.isPending}>
          {accounts.isPending ? (
            <p className="py-4">{t("account_loading")}</p>
          ) : (
            accounts.data?.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {account.providerId === "google" ? (
                    <GoogleIcon className="size-6 shrink-0" />
                  ) : (
                    <KeyRound className="size-6 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">
                      {account.providerId === "google" ? "Google" : t("auth_password")}
                    </p>
                    <p className="break-all text-sm text-muted-foreground">
                      {session.data?.user.email}
                    </p>
                  </div>
                </div>
                {account.providerId !== "credential" && (
                  <ConfirmAction
                    label={t("account_unlink")}
                    subject={`Google · ${session.data?.user.email}`}
                    disabled={change.isPending}
                    icon={<Unlink />}
                    onConfirm={() =>
                      change.mutate(async () =>
                        authResult(await authClient.unlinkAccount({ accountId: account.id })),
                      )
                    }
                  />
                )}
              </div>
            ))
          )}
        </div>
        {!accounts.isPending &&
          !accounts.data?.some((account) => account.providerId === "google") && (
            <Button
              variant="outline"
              disabled={change.isPending}
              onClick={() =>
                change.mutate(async () =>
                  authResult(
                    await authClient.linkSocial({ provider: "google", callbackURL: "/account" }),
                  ),
                )
              }
            >
              <GoogleIcon className="size-5" />
              {t("account_link_google")}
            </Button>
          )}
      </section>
      <section className={section}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="size-5" />
          {t("account_passkeys")}
        </h2>
        <div className="min-h-12" aria-busy={keys.isPending}>
          {keys.isPending ? (
            <p>{t("account_loading")}</p>
          ) : keys.data?.length ? (
            keys.data.map((key) => (
              <div
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="size-5" />
                  {key.name || t("account_passkeys")}
                </span>
                <ConfirmAction
                  label={t("account_remove")}
                  subject={key.name || t("account_passkeys")}
                  disabled={change.isPending}
                  icon={<Trash2 />}
                  onConfirm={() =>
                    change.mutate(async () =>
                      authResult(await authClient.passkey.deletePasskey({ id: key.id })),
                    )
                  }
                />
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">{t("account_no_passkeys")}</p>
          )}
        </div>
        <form
          className="flex max-w-2xl flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate(async () =>
              authResult(await authClient.passkey.addPasskey({ name: passkeyName || "TableCast" })),
            );
          }}
        >
          <label className="min-w-48 flex-1 space-y-2">
            {t("account_key_name")}
            <Input
              maxLength={100}
              value={passkeyName}
              onChange={(event) => setPasskeyName(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={change.isPending}>
            <Plus />
            {t("account_add_passkey")}
          </Button>
        </form>
      </section>
      <section className={section}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Monitor className="size-5" />
          {t("account_sessions")}
        </h2>
        <div className="max-h-96 min-h-24 overflow-y-auto overscroll-contain">
          {[
            session.data?.session,
            ...(sessions.data ?? []).filter((item) => item.id !== session.data?.session.id),
          ]
            .filter((item) => item !== undefined)
            .map((item) => {
              const ua = item.userAgent ?? "";
              const browser = /Edg\//.test(ua)
                ? "Edge"
                : /Chrome\//.test(ua)
                  ? "Chrome"
                  : /Firefox\//.test(ua)
                    ? "Firefox"
                    : /Safari\//.test(ua)
                      ? "Safari"
                      : t("account_device");
              const system = /iPad|iPhone/.test(ua)
                ? "iOS"
                : /Android/.test(ua)
                  ? "Android"
                  : /Mac OS/.test(ua)
                    ? "macOS"
                    : /Windows/.test(ua)
                      ? "Windows"
                      : /Linux/.test(ua)
                        ? "Linux"
                        : "";
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Monitor className="size-5 shrink-0" />
                    <div>
                      <p className="font-medium">
                        {browser}
                        {system && ` · ${system}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString(
                          locale === "ja" ? "ja-JP" : "en-GB",
                        )}
                      </p>
                      {item.id === session.data?.session.id && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm">
                          <Check className="size-4" />
                          {t("account_current")}
                        </span>
                      )}
                    </div>
                  </div>
                  <ConfirmAction
                    label={t("account_revoke")}
                    subject={`${browser} · ${system}`}
                    disabled={change.isPending}
                    icon={<LogOut />}
                    onConfirm={() =>
                      change.mutate(async () => {
                        authResult(await authClient.revokeSession({ token: item.token }));
                        if (item.id === session.data?.session.id) window.location.assign("/login");
                      })
                    }
                  />
                </div>
              );
            })}
        </div>
        <ConfirmAction
          label={t("account_revoke_others")}
          subject={t("account_keep_current")}
          disabled={change.isPending}
          icon={<LogOut />}
          onConfirm={() =>
            change.mutate(async () => authResult(await authClient.revokeOtherSessions()))
          }
        />
      </section>
    </SettingsShell>
  );
}
