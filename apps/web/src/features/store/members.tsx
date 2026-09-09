import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MailPlus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { membershipOptions } from "./membership-query";
import { RoleBadge } from "./role-badge";
import { useStore } from "./store-shell";
type Role = "owner" | "admin" | "member";
const load = async (organizationId: string) =>
  authResult(await authClient.organization.getFullOrganization({ query: { organizationId } }));
type Member = Awaited<ReturnType<typeof load>>["members"][number];
type Action = { kind: "role"; memberId: string; role: Role } | { kind: "remove"; memberId: string };
export function Members() {
  const store = useStore(),
    { t } = useI18n(),
    client = useQueryClient(),
    session = authClient.useSession();
  const query = useQuery(membershipOptions(store.organizationId));
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("org_members")}</h1>
        {store.role !== "member" && (
          <Button
            nativeButton={false}
            role="link"
            render={<Link to="/admin/stores/$storeId/invitations" params={{ storeId: store.id }} />}
          >
            <MailPlus />
            {t("invitations_title")}
          </Button>
        )}
      </div>
      <ErrorNotice error={query.error || change.error} />
      {query.isPending ? (
        <p role="status">{t("common_loading")}</p>
      ) : (
        <DataTable
          data={query.data?.members ?? []}
          columns={columns}
          getRowId={(member) => member.id}
          searchLabel={t("auth_email")}
        />
      )}
    </>
  );
}
function memberColumns(
  t: ReturnType<typeof useI18n>["t"],
  myRole: string,
  userId: string | undefined,
  pending: boolean,
  change: (action: Action) => void,
): ColumnDef<Member>[] {
  return [
    {
      id: "user",
      accessorFn: (row) => `${row.user.name} ${row.user.email}`,
      header: t("org_members"),
      cell: ({ row }) => <UserIdentity user={row.original.user} />,
    },
    {
      accessorKey: "role",
      header: t("org_role"),
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      accessorKey: "createdAt",
      header: t("members_created_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      id: "actions",
      header: t("common_actions"),
      cell: ({ row }) =>
        myRole !== "member" && (
          <div className="flex items-center gap-2">
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
