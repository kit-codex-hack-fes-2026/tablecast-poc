import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MailPlus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useMemo } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { PageHeader } from "../../components/page-header";
import { RoleBadge } from "../../components/role-badge";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { sessionOptions } from "../../lib/session-query";
import { useCollectionSearch } from "../shell/collection-search";
import { type Membership, membershipOptions } from "./membership-query";
import { useStore } from "./store-context";
type Role = "admin" | "member" | "owner";
type Member = Membership["members"][number];
type Action = { kind: "remove"; memberId: string } | { kind: "role"; memberId: string; role: Role };
export function Members() {
  const collection = useCollectionSearch({ sortIds: ["user", "role", "createdAt"] });
  const store = useStore(),
    { t } = useI18n(),
    client = useQueryClient(),
    session = useSuspenseQuery(sessionOptions);
  const query = useSuspenseQuery(membershipOptions(store.organizationId));
  const change = useMutation({
    mutationFn: async (action: Action) => {
      if (action.kind === "remove")
        authResult(
          await authClient.organization.removeMember({
            organizationId: store.organizationId,
            memberIdOrEmail: action.memberId,
          }),
        );
      else
        authResult(
          await authClient.organization.updateMemberRole({
            organizationId: store.organizationId,
            memberId: action.memberId,
            role: action.role,
          }),
        );
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["tablecast-membership", store.organizationId] }),
  });
  const columns = useMemo(
    () => memberColumns(t, store.role, session.data?.user.id, change.isPending, change.mutate),
    [t, store.role, session.data?.user.id, change.isPending, change.mutate],
  );
  return (
    <>
      <PageHeader
        title={t("org_members")}
        icon={<Users />}
        actions={
          store.role !== "member" && (
            <Button
              nativeButton={false}
              role="link"
              render={
                <Link to="/admin/stores/$storeId/invitations" params={{ storeId: store.id }} />
              }
            >
              <MailPlus />
              {t("invitations_title")}
            </Button>
          )
        }
      />
      <ErrorNotice error={query.error || change.error} onRetry={() => void query.refetch()} />

      <DataTable
        defaultSort={{ id: "createdAt", desc: false }}
        {...collection}
        data={query.data.members}
        columns={columns}
        getRowId={(member) => member.id}
        tableLabel={t("org_members")}
        searchLabel={t("collection_search_members")}
        searchPlaceholder={t("collection_search_members_placeholder")}
      />
    </>
  );
}
function memberColumns(
  t: ReturnType<typeof useI18n>["t"],
  myRole: string,
  userId: string | undefined,
  pending: boolean,
  change: (action: Action) => void,
): DataTableColumn<Member>[] {
  return [
    {
      id: "user",
      accessorFn: (row) => `${row.user.name} ${row.user.email}`,
      header: t("org_members"),
      meta: { icon: Users, rowHeader: true, sortLabel: t("collection_member_name") },
      cell: ({ row }) => (
        <div className="min-w-56 max-w-sm">
          <UserIdentity user={row.original.user} />
        </div>
      ),
    },
    {
      id: "role",
      accessorFn: (row) => (row.role === "owner" ? 0 : row.role === "admin" ? 1 : 2),
      enableGlobalFilter: false,
      meta: { icon: ShieldCheck },
      header: t("org_role"),
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      id: "createdAt",
      accessorFn: (row) => new Date(row.createdAt).getTime(),
      enableGlobalFilter: false,
      meta: { icon: CalendarDays },
      header: t("members_created_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      id: "actions",
      meta: { align: "right" },
      header: t("common_actions"),
      cell: ({ row }) =>
        myRole !== "member" && (
          <div className="flex items-center justify-end gap-2">
            <NativeSelect
              className="w-36"
              aria-label={`${t("org_role")} ${row.original.user.email}`}
              value={row.original.role}
              disabled={pending || (row.original.role === "owner" && myRole !== "owner")}
              onChange={(event) => {
                const role = event.target.value;
                if (role === "owner" || role === "admin" || role === "member")
                  change({ kind: "role", memberId: row.original.id, role });
              }}
            >
              <option value="owner" disabled={myRole !== "owner"}>
                {t("org_owner")}
              </option>
              <option value="admin">{t("org_admin")}</option>
              <option value="member">{t("org_member")}</option>
            </NativeSelect>
            <ConfirmAction
              label={t("account_remove")}
              subject={row.original.user.email}
              icon={<Trash2 />}
              disabled={
                pending ||
                row.original.userId === userId ||
                (row.original.role === "owner" && myRole !== "owner")
              }
              onConfirm={() => change({ kind: "remove", memberId: row.original.id })}
            />
          </div>
        ),
    },
  ];
}
