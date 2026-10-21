import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CircleCheck,
  Mail,
  MailPlus,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { PageHeader } from "../../components/page-header";
import { RoleBadge } from "../../components/role-badge";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { useCollectionSearch } from "../shell/collection-search";
import { type Membership, membershipOptions } from "./membership-query";
import { useStore } from "./store-context";
type Invitation = Membership["invitations"][number];
export function Invitations() {
  const collection = useCollectionSearch({ sortIds: ["email", "role", "status", "expiresAt"] });
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
      <PageHeader
        title={t("invitations_title")}
        actions={
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
        }
      />
      <ErrorNotice error={query.error || cancel.error} onRetry={() => void query.refetch()} />
      <DataTable
        {...collection}
        data={query.data.invitations}
        error={query.error}
        onRetry={() => void query.refetch()}
        columns={columns}
        getRowId={(row) => row.id}
        tableLabel={t("invitations_title")}
        searchLabel={t("collection_search_invitations")}
        searchPlaceholder={t("collection_search_invitations_placeholder")}
      />
    </>
  );
}
function invitationColumns(
  t: ReturnType<typeof useI18n>["t"],
  pending: boolean,
  cancel: (id: string) => void,
): DataTableColumn<Invitation>[] {
  return [
    {
      accessorKey: "email",
      header: t("auth_email"),
      meta: { icon: Mail, rowHeader: true },
      cell: ({ row }) => <UserIdentity user={{ email: row.original.email }} compact />,
    },
    {
      id: "role",
      accessorFn: (row) => (row.role === "owner" ? 0 : row.role === "admin" ? 1 : 2),
      enableGlobalFilter: false,
      meta: { icon: ShieldCheck },
      header: t("org_role"),
      cell: ({ row }) => <RoleBadge role={row.original.role ?? "member"} />,
    },
    {
      id: "status",
      accessorFn: (row) =>
        row.status === "pending"
          ? 0
          : row.status === "accepted"
            ? 1
            : row.status === "rejected"
              ? 2
              : 3,
      enableGlobalFilter: false,
      meta: { icon: CircleCheck },
      header: t("common_status"),
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "pending"
              ? "warning"
              : row.original.status === "accepted"
                ? "success"
                : "inactive"
          }
        >
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
      id: "expiresAt",
      accessorFn: (row) => new Date(row.expiresAt).getTime(),
      enableGlobalFilter: false,
      meta: { icon: CalendarClock },
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
    mutationFn: async (input: { email: string; role: "admin" | "member" | "owner" }) =>
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
    defaultValues: { email: "", role: "member" as "admin" | "member" | "owner" },
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
      <PageHeader title={t("org_invite")} />
      <form.AppForm>
        <form.Form noValidate className="max-w-xl space-y-5">
          <form.AppField
            name="email"
            validators={{ onChange: z.email({ error: t("form_email") }) }}
          >
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

          <form.SubmitButton>
            <MailPlus />
            {t("org_send_invitation")}
          </form.SubmitButton>
        </form.Form>
      </form.AppForm>
    </>
  );
}
