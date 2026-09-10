import { z } from "zod";
import { useAppForm } from "../../components/form";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, MailPlus, X } from "lucide-react";
import { useMemo } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { membershipOptions } from "./membership-query";
import { RoleBadge } from "../../components/role-badge";
import { useStore } from "./store-shell";
const load = async (organizationId: string) =>
  authResult(await authClient.organization.getFullOrganization({ query: { organizationId } }));
type Invitation = Awaited<ReturnType<typeof load>>["invitations"][number];
export function Invitations() {
  const store = useStore(),
    { t } = useI18n(),
    client = useQueryClient();
  const query = useSuspenseQuery(membershipOptions(store.organizationId));
  const cancel = useMutation({
    mutationFn: async (invitationId: string) =>
      authResult(await authClient.organization.cancelInvitation({ invitationId })),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["tablecast-membership", store.organizationId] }),
  });
  const columns = useMemo(
    () => invitationColumns(t, cancel.isPending, cancel.mutate),
    [t, cancel.isPending, cancel.mutate],
  );
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("invitations_title")}</h1>
        <Button
          nativeButton={false}
          role="link"
          render={
            <Link to="/admin/stores/$storeId/invitations/new" params={{ storeId: store.id }} />
          }
        >
          <MailPlus />
          {t("org_invite")}
        </Button>
      </div>
      <ErrorNotice error={query.error || cancel.error} onRetry={() => void query.refetch()} />
      <DataTable
        data={query.data.invitations}
        error={query.error}
        onRetry={() => void query.refetch()}
        columns={columns}
        getRowId={(row) => row.id}
        searchLabel={t("auth_email")}
      />
    </>
  );
}
function invitationColumns(
  t: ReturnType<typeof useI18n>["t"],
  pending: boolean,
  cancel: (id: string) => void,
): ColumnDef<Invitation>[] {
  return [
    { accessorKey: "email", header: t("auth_email") },
    {
      accessorKey: "role",
      header: t("org_role"),
      cell: ({ row }) => <RoleBadge role={row.original.role ?? "member"} />,
    },
    {
      accessorKey: "status",
      header: t("common_status"),
      cell: ({ row }) => (
        <Badge variant="outline">
          {t(
            row.original.status === "pending"
              ? "invite_pending"
              : row.original.status === "accepted"
                ? "invite_accepted"
                : row.original.status === "rejected"
                  ? "invite_rejected"
                  : "invite_canceled",
          )}
        </Badge>
      ),
    },
    {
      accessorKey: "expiresAt",
      header: t("invite_expires_at"),
      cell: ({ row }) => <DateTime value={row.original.expiresAt} />,
    },
    {
      id: "actions",
      header: t("org_cancel_invitation"),
      cell: ({ row }) =>
        row.original.status === "pending" && (
          <ConfirmAction
            label={t("org_cancel_invitation")}
            subject={row.original.email}
            icon={<X />}
            disabled={pending}
            onConfirm={() => cancel(row.original.id)}
          />
        ),
    },
  ];
}
export function InviteMember() {
  const store = useStore(),
    { t } = useI18n(),
    navigate = useNavigate(),
    client = useQueryClient();
  const invite = useMutation({
    mutationFn: async (input: { email: string; role: "member" | "admin" | "owner" }) =>
      authResult(
        await authClient.organization.inviteMember({
          ...input,
          organizationId: store.organizationId,
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["tablecast-membership", store.organizationId] });
      await navigate({ to: "/admin/stores/$storeId/invitations", params: { storeId: store.id } });
    },
  });
  const form = useAppForm({
    defaultValues: { email: "", role: "member" as "member" | "admin" | "owner" },
    onSubmit: async ({ value }) => {
      await invite.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <>
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        render={<Link to="/admin/stores/$storeId/invitations" params={{ storeId: store.id }} />}
      >
        <ArrowLeft />
        {t("invitations_title")}
      </Button>
      <h1 className="text-2xl font-semibold">{t("org_invite")}</h1>
      <form
        noValidate
        className="max-w-xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppField name="email" validators={{ onChange: z.email({ error: t("form_email") }) }}>
          {(field) => (
            <field.TextField label={t("auth_email")} type="email" required autoComplete="email" />
          )}
        </form.AppField>
        <form.Field name="role">
          {(field) => (
            <label className="flex flex-col gap-2">
              {t("org_role")}
              <NativeSelect
                value={field.state.value}
                onChange={(e) => {
                  const role = e.target.value;
                  if (role === "owner" || role === "admin" || role === "member")
                    field.handleChange(role);
                }}
              >
                <option value="member">{t("org_member")}</option>
                <option value="admin">{t("org_admin")}</option>
                {store.role === "owner" && <option value="owner">{t("org_owner")}</option>}
              </NativeSelect>
            </label>
          )}
        </form.Field>
        <ErrorNotice error={invite.error} />
        <form.AppForm>
          <form.SubmitButton>
            <MailPlus />
            {t("org_send_invitation")}
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </>
  );
}
