import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
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
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { GoogleIcon } from "../../components/google-icon";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { ActionFeedback } from "../../components/action-feedback";
import { UserIdentity } from "../../components/user-identity";
import { PageHeader } from "../../components/page-header";
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

function useAccount(pending: boolean) {
  const { t } = useI18n();
  const session = useQuery(sessionOptions);
  const client = useQueryClient();
  const [sessions, accounts, keys] = useQueries({
    queries: [accountSessionsOptions, accountLinksOptions, accountKeysOptions],
  });
  const change = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-account"] });
      void session.refetch();
    },
  });
  const section = "min-w-0 scroll-mt-24 space-y-5 pb-8";
  return {
    t,
    session,
    client,
    sessions,
    accounts,
    keys,
    change,
    section,
    loading: pending || sessions.isPending || accounts.isPending || keys.isPending,
  };
}
export function Account({ pending = false }: { pending?: boolean }) {
  const controller = useAccount(pending);
  const { t, change, sessions, accounts, keys } = controller;
  const error = change.error || sessions.error || accounts.error || keys.error;
  return (
    <SettingsShell>
      <PageHeader title={t("account_title")} />
      {(change.isPending || change.isSuccess || error) && (
        <ActionFeedback
          pending={change.isPending}
          error={error}
          success={change.isSuccess}
          successMessage={t("account_saved")}
        />
      )}
      <div className="@container">
        <div className="grid min-w-0 gap-7 @4xl:grid-cols-[11rem_minmax(0,1fr)]">
          <nav
            aria-label={t("account_title")}
            className="flex h-fit flex-wrap gap-1 @4xl:sticky @4xl:top-20 @4xl:flex-col"
          >
            {(
              [
                ["profile", "account_profile"],
                ["connections", "account_connections"],
                ["passkeys", "account_passkeys"],
                ["sessions", "account_sessions"],
              ] as const
            ).map(([id, label]) => (
              <a
                key={id}
                href={`#account-${id}`}
                className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                {t(label)}
              </a>
            ))}
          </nav>
          <div className="min-w-0 space-y-8">
            <AccountProfile controller={controller} />
            <AccountConnections controller={controller} />
            <AccountPasskeys controller={controller} />
            <AccountSessions controller={controller} />
          </div>
        </div>
      </div>
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
          formApi.reset(value);
        })
        .catch(() => undefined);
    },
  });
  return (
    <section id="account-profile" aria-labelledby="account-profile-title" className={section}>
      <h2 id="account-profile-title" className="flex items-center gap-2 text-lg font-semibold">
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
            disabled={change.isPending || controller.loading}
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
                disabled={change.isPending || controller.loading}
              />
            )}
          </form.AppField>
        </div>
        <form.AppForm>
          <form.SubmitButton disabled={change.isPending || controller.loading}>
            {t("account_save")}
          </form.SubmitButton>
        </form.AppForm>
      </form>
      {!session.data?.user.emailVerified && (
        <Button
          variant="outline"
          disabled={change.isPending || controller.loading}
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
    () =>
      connectionColumns(
        t,
        session.data?.user.email,
        change.isPending || controller.loading,
        change.mutate,
      ),
    [t, session.data?.user.email, change.isPending, controller.loading, change.mutate],
  );
  return (
    <section
      id="account-connections"
      aria-labelledby="account-connections-title"
      className={section}
    >
      <h2 id="account-connections-title" className="flex items-center gap-2 text-lg font-semibold">
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
      <div className="min-h-11">
        {(!accounts.data || !accounts.data.some((item) => item.providerId === "google")) && (
          <Button
            variant="outline"
            disabled={change.isPending || controller.loading}
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
      </div>
    </section>
  );
}
function connectionColumns(
  t: AccountController["t"],
  email: string | undefined,
  pending: boolean,
  change: (action: () => Promise<void>) => void,
): DataTableColumn<Connection>[] {
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
    () => passkeyColumns(t, change.isPending || controller.loading, change.mutate),
    [t, change.isPending, controller.loading, change.mutate],
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
    <section id="account-passkeys" aria-labelledby="account-passkeys-title" className={section}>
      <h2 id="account-passkeys-title" className="flex items-center gap-2 text-lg font-semibold">
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
            {(field) => (
              <field.TextField
                label={t("account_key_name")}
                maxLength={100}
                disabled={controller.loading}
              />
            )}
          </form.AppField>
        </div>
        <form.AppForm>
          <form.SubmitButton disabled={change.isPending || controller.loading}>
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
): DataTableColumn<Passkey>[] {
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
    () =>
      loginSessionColumns(
        t,
        session.data?.session.id,
        change.isPending || controller.loading,
        change.mutate,
      ),
    [t, session.data?.session.id, change.isPending, controller.loading, change.mutate],
  );
  return (
    <section id="account-sessions" aria-labelledby="account-sessions-title" className={section}>
      <h2 id="account-sessions-title" className="flex items-center gap-2 text-lg font-semibold">
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
        disabled={change.isPending || controller.loading}
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
): DataTableColumn<Session>[] {
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
