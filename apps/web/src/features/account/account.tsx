import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Link2, Monitor, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { SettingsShell } from "./settings-shell";

export function Account() {
  const { t } = useI18n();
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
  const section = "space-y-4 rounded-2xl border border-border bg-white p-6 shadow-sm";
  return (
    <SettingsShell>
      <h1 className="text-2xl font-semibold">{t("account_title")}</h1>
      {(change.error || sessions.error || accounts.error || keys.error) && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">
          {t("account_failed")}
        </p>
      )}
      {change.isSuccess && <output>{t("account_saved")}</output>}
      <section className={section}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserRound />
          {t("account_profile")}
        </h2>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate(async () =>
              authResult(
                await authClient.updateUser({ name: name ?? session.data?.user.name ?? "" }),
              ),
            );
          }}
        >
          {session.data?.user.image && (
            <img
              src={session.data.user.image}
              alt=""
              className="size-16 rounded-full object-cover"
            />
          )}
          <label className="space-y-2">
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
          <label className="space-y-2">
            {t("account_avatar")}
            <Input
              type="file"
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
        </form>
        <p className="text-sm text-muted-foreground">{session.data?.user.email}</p>
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
            {t("account_verify")}
          </Button>
        )}
      </section>
      <section className={section}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Link2 />
          {t("account_connections")}
        </h2>
        {accounts.data?.map((account) => (
          <div key={account.id} className="flex items-center justify-between gap-4">
            <span>{account.providerId}</span>
            {account.providerId !== "credential" && (
              <Button
                variant="outline"
                disabled={change.isPending}
                onClick={() =>
                  change.mutate(async () =>
                    authResult(
                      await authClient.unlinkAccount({
                        accountId: account.id,
                      }),
                    ),
                  )
                }
              >
                {t("account_unlink")}
              </Button>
            )}
          </div>
        ))}
        {!accounts.data?.some((account) => account.providerId === "google") && (
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
            {t("account_link_google")}
          </Button>
        )}
      </section>
      <section className={section}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound />
          {t("account_passkeys")}
        </h2>
        {keys.data?.map((key) => (
          <div key={key.id} className="flex items-center justify-between gap-4">
            <span>{key.name || t("account_passkeys")}</span>
            <Button
              variant="outline"
              disabled={change.isPending}
              onClick={() =>
                change.mutate(async () =>
                  authResult(await authClient.passkey.deletePasskey({ id: key.id })),
                )
              }
            >
              {t("account_remove")}
            </Button>
          </div>
        ))}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate(async () =>
              authResult(await authClient.passkey.addPasskey({ name: passkeyName || "TableCast" })),
            );
          }}
        >
          <label>
            {t("account_key_name")}
            <Input
              maxLength={100}
              value={passkeyName}
              onChange={(event) => setPasskeyName(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={change.isPending}>
            {t("account_add_passkey")}
          </Button>
        </form>
      </section>
      <section className={section}>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Monitor />
          {t("account_sessions")}
        </h2>
        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {[
            session.data?.session,
            ...(sessions.data ?? []).filter((item) => item.id !== session.data?.session.id),
          ]
            .filter((item) => item !== undefined)
            .sort(
              (a, b) =>
                Number(b.id === session.data?.session.id) -
                  Number(a.id === session.data?.session.id) ||
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm">{item.userAgent || t("account_device")}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}{" "}
                    {item.id === session.data?.session.id && t("account_current")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={change.isPending}
                  onClick={() =>
                    change.mutate(async () => {
                      authResult(await authClient.revokeSession({ token: item.token }));
                      if (item.id === session.data?.session.id) window.location.assign("/login");
                    })
                  }
                >
                  {t("account_revoke")}
                </Button>
              </div>
            ))}
        </div>
        <Button
          variant="outline"
          disabled={change.isPending}
          onClick={() =>
            change.mutate(async () => authResult(await authClient.revokeOtherSessions()))
          }
        >
          {t("account_revoke_others")}
        </Button>
      </section>
    </SettingsShell>
  );
}
