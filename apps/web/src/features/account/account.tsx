import { useMutation, useQuery, useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
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
import { useMemo } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { GoogleIcon } from "../../components/google-icon";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { ActionFeedback } from "../../components/action-feedback";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { sessionOptions } from "../../lib/session-query";
import {
  accountKeysOptions,
  accountLinksOptions,
  accountSessionsOptions,
} from "../account/account-query";

import { parseResponse, rpc } from "../../lib/api";
import { authClient, authResult } from "../../lib/auth-client";
import { SettingsShell } from "../shell/settings-shell";

function useAccount() {
  const { t } = useI18n();
  const session = useQuery(sessionOptions);
  const client = useQueryClient();
  const [sessions, accounts, keys] = useSuspenseQueries({
    queries: [accountSessionsOptions, accountLinksOptions, accountKeysOptions],
  });
  const change = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-account"] });
      void session.refetch();
    },
  });
  const section = "space-y-5 rounded-2xl border border-border bg-white p-4 sm:p-5";
  return {
    t,
    session,
    client,
    sessions,
    accounts,
    keys,
    change,
    section,
  };
}
export function Account() {
  const controller = useAccount();
  const { t, change, sessions, accounts, keys } = controller;
  return (
    <SettingsShell>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("account_title")}</h1>
      </div>
      <ActionFeedback
        pending={change.isPending}
        error={change.error || sessions.error || accounts.error || keys.error}
        success={change.isSuccess}
        successMessage={t("account_saved")}
      />
      <AccountProfile controller={controller} />
      <AccountConnections controller={controller} />
      <AccountPasskeys controller={controller} />
      <AccountSessions controller={controller} />
    </SettingsShell>
  );
}

function AccountProfile({ controller }: { controller: ReturnType<typeof useAccount> }) {
  const { t, session, change, section } = controller;
  const form = useAppForm({
    defaultValues: { name: session.data?.user.name ?? "" },
    onSubmit: async ({ value, formApi }) => {
      await change
        .mutateAsync(async () => {
          authResult(await authClient.updateUser(value));
        })
        .then(() => formApi.reset(value))
        .catch(() => undefined);
    },
  });
  return (
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
                await parseResponse(rpc.api.account.avatar.$post({ form: { image: file } }));
              });
            }}
          />
        </label>
      </div>
      <form
        noValidate
        className="flex max-w-2xl flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="min-w-48 flex-1">
          <form.AppField
            name="name"
            validators={{ onChange: z.string().trim().min(1, t("form_required")).max(100) }}
          >
            {(field) => (
              <field.TextField
                label={t("account_name")}
                required
                maxLength={100}
                autoComplete="name"
              />
            )}
          </form.AppField>
        </div>
        <form.AppForm>
          <form.SubmitButton disabled={change.isPending}>{t("account_save")}</form.SubmitButton>
        </form.AppForm>
      </form>
      {!session.data?.user.emailVerified && (
        <Button
          variant="outline"
          disabled={change.isPending}
          onClick={() =>
            change.mutate(async () => {
              authResult(
                await authClient.sendVerificationEmail({
                  email: session.data?.user.email ?? "",
                  callbackURL: "/account",
                }),
              );
            })
          }
        >
          <ShieldCheck />
          {t("account_verify")}
        </Button>
      )}
    </section>
  );
}

type AccountController = ReturnType<typeof useAccount>;
type Connection = NonNullable<AccountController["accounts"]["data"]>[number];
type Passkey = NonNullable<AccountController["keys"]["data"]>[number];
type Session = NonNullable<AccountController["sessions"]["data"]>[number];
function AccountConnections({ controller }: { controller: AccountController }) {
  const { t, accounts, change, session, section } = controller;
  const columns = useMemo(
    () => connectionColumns(t, session.data?.user.email, change.isPending, change.mutate),
    [t, session.data?.user.email, change.isPending, change.mutate],
  );
  return (
    <section className={section}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Link2 />
        {t("account_connections")}
      </h2>
      <DataTable
        data={accounts.data ?? []}
        pending={accounts.isPending}
        error={accounts.error}
        onRetry={() => void accounts.refetch()}
        columns={columns}
        getRowId={(row) => row.id}
      />
      {accounts.data && !accounts.data.some((item) => item.providerId === "google") && (
        <Button
          variant="outline"
          disabled={change.isPending}
          onClick={() =>
            change.mutate(async () => {
              authResult(
                await authClient.linkSocial({ provider: "google", callbackURL: "/account" }),
              );
            })
          }
        >
          <GoogleIcon />
          {t("account_link_google")}
        </Button>
      )}
    </section>
  );
}
function connectionColumns(
  t: AccountController["t"],
  email: string | undefined,
  pending: boolean,
  change: (action: () => Promise<void>) => void,
): ColumnDef<Connection>[] {
  return [
    {
      accessorKey: "providerId",
      header: t("account_connections"),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.providerId === "google" ? <GoogleIcon /> : <ShieldCheck />}
          <div>
            <p>{row.original.providerId === "google" ? "Google" : t("auth_password")}</p>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: t("mcp_connected_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      accessorKey: "updatedAt",
      header: t("mcp_updated_at"),
      cell: ({ row }) => <DateTime value={row.original.updatedAt} />,
    },
    {
      id: "actions",
      header: t("account_unlink"),
      cell: ({ row }) =>
        row.original.providerId !== "credential" && (
          <ConfirmAction
            label={t("account_unlink")}
            subject={`Google · ${email}`}
            disabled={pending}
            icon={<Unlink />}
            onConfirm={() =>
              change(async () => {
                authResult(await authClient.unlinkAccount({ accountId: row.original.id }));
              })
            }
          />
        ),
    },
  ];
}
function AccountPasskeys({ controller }: { controller: AccountController }) {
  const { t, keys, change, section } = controller;
  const columns = useMemo(
    () => passkeyColumns(t, change.isPending, change.mutate),
    [t, change.isPending, change.mutate],
  );
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value, formApi }) => {
      await change
        .mutateAsync(async () => {
          authResult(await authClient.passkey.addPasskey({ name: value.name || "TableCast" }));
        })
        .then(() => formApi.reset(value))
        .catch(() => undefined);
    },
  });
  return (
    <section className={section}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <KeyRound />
        {t("account_passkeys")}
      </h2>
      <DataTable
        data={keys.data ?? []}
        pending={keys.isPending}
        error={keys.error}
        onRetry={() => void keys.refetch()}
        columns={columns}
        getRowId={(row) => row.id}
        empty={t("account_no_passkeys")}
      />
      <form
        noValidate
        className="flex max-w-2xl flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="min-w-48 flex-1">
          <form.AppField name="name" validators={{ onChange: z.string().max(100) }}>
            {(field) => <field.TextField label={t("account_key_name")} maxLength={100} />}
          </form.AppField>
        </div>
        <form.AppForm>
          <form.SubmitButton disabled={change.isPending}>
            <Plus />
            {t("account_add_passkey")}
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </section>
  );
}
function passkeyColumns(
  t: AccountController["t"],
  pending: boolean,
  change: (action: () => Promise<void>) => void,
): ColumnDef<Passkey>[] {
  return [
    {
      accessorKey: "name",
      header: t("account_key_name"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <KeyRound />
          {row.original.name || t("account_passkeys")}
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: t("mcp_connected_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      id: "actions",
      header: t("account_remove"),
      cell: ({ row }) => (
        <ConfirmAction
          label={t("account_remove")}
          subject={row.original.name || t("account_passkeys")}
          disabled={pending}
          icon={<Trash2 />}
          onConfirm={() =>
            change(async () => {
              authResult(await authClient.passkey.deletePasskey({ id: row.original.id }));
            })
          }
        />
      ),
    },
  ];
}
function AccountSessions({ controller }: { controller: AccountController }) {
  const { t, sessions, session, change, section } = controller;
  const columns = useMemo(
    () => loginSessionColumns(t, session.data?.session.id, change.isPending, change.mutate),
    [t, session.data?.session.id, change.isPending, change.mutate],
  );
  return (
    <section className={section}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Monitor />
        {t("account_sessions")}
      </h2>
      <DataTable
        data={sessions.data ?? []}
        pending={sessions.isPending}
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
        columns={columns}
        getRowId={(row) => row.id}
      />
      <ConfirmAction
        label={t("account_revoke_others")}
        subject={t("account_keep_current")}
        disabled={change.isPending}
        icon={<LogOut />}
        onConfirm={() =>
          change.mutate(async () => {
            authResult(await authClient.revokeOtherSessions());
          })
        }
      />
    </section>
  );
}
function loginSessionColumns(
  t: AccountController["t"],
  currentId: string | undefined,
  pending: boolean,
  change: (action: () => Promise<void>) => void,
): ColumnDef<Session>[] {
  return [
    {
      accessorKey: "userAgent",
      header: t("account_device"),
      cell: ({ row }) => (
        <div className="flex max-w-sm items-center gap-3">
          <Monitor className="shrink-0" />
          <div>
            <p className="wrap-break-word text-sm">
              {row.original.userAgent || t("account_device")}
            </p>
            {row.original.id === currentId && (
              <Badge variant="secondary">
                <Check />
                {t("account_current")}
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: t("mcp_connected_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      accessorKey: "updatedAt",
      header: t("mcp_updated_at"),
      cell: ({ row }) => <DateTime value={row.original.updatedAt} />,
    },
    {
      accessorKey: "expiresAt",
      header: t("invite_expires_at"),
      cell: ({ row }) => <DateTime value={row.original.expiresAt} />,
    },
    {
      id: "actions",
      header: t("account_revoke"),
      cell: ({ row }) => (
        <ConfirmAction
          label={t("account_revoke")}
          subject={row.original.userAgent || t("account_device")}
          disabled={pending}
          icon={<LogOut />}
          onConfirm={() =>
            change(async () => {
              authResult(await authClient.revokeSession({ token: row.original.token }));
              if (row.original.id === currentId) window.location.assign("/login");
            })
          }
        />
      ),
    },
  ];
}
