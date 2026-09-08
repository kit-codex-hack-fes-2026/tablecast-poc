import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
export function TeamMembers({
  teamId,
  organizationId,
  members,
}: {
  teamId: string;
  organizationId: string;
  members: { userId: string; user: { name: string } }[];
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["tablecast-organisations", organizationId, "team-members", teamId],
    queryFn: async () =>
      authResult(await authClient.organization.listTeamMembers({ query: { teamId } })),
  });
  const change = useMutation({
    mutationFn: async ({ userId, remove }: { userId: string; remove: boolean }) => {
      if (remove)
        return authResult(
          await authClient.organization.removeTeamMember({ teamId, userId, organizationId }),
        );
      return authResult(
        await authClient.organization.addTeamMember({ teamId, userId, organizationId }),
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["tablecast-organisations", organizationId, "team-members", teamId],
      });
    },
  });
  return (
    <div className="space-y-2">
      {members.map((member) => {
        const included = list.data?.some((item) => item.userId === member.userId);
        return (
          <div key={member.userId} className="flex items-center justify-between gap-3">
            <span>{member.user.name}</span>
            <Button
              variant="outline"
              disabled={change.isPending || list.isPending}
              onClick={() => change.mutate({ userId: member.userId, remove: !!included })}
            >
              {t(included ? "account_remove" : "org_add_member")}
            </Button>
          </div>
        );
      })}
      {(list.error || change.error) && (
        <p role="alert" className="text-destructive">
          {t("account_failed")}
        </p>
      )}
    </div>
  );
}
