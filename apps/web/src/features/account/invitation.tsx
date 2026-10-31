import { useMutation, useQuery } from "@tanstack/react-query";
import type { SimpleMessageKey } from "../../i18n/locale";
import { DateTime } from "../../components/date-time";
import { RoleBadge } from "../../components/role-badge";
import { Button } from "../../components/ui/button";
import { UserIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { authClient, authResult } from "../../lib/auth-client";
import { sessionOptions } from "../../lib/session-query";
import { SettingsShell } from "../store/settings-shell";

export function Invitation({ id }: { id: string }) {
  const { t } = useI18n();
  const session = useQuery(sessionOptions);
  const invitation = useQuery({
    queryKey: ["tablecast-invitation", id],
    queryFn: () => parseResponse(rpc.api.account.invitations[":id"].$get({ param: { id } })),
    enabled: !!session.data,
  });
  const decide = useMutation({
    mutationFn: async (accept: boolean) => {
      if (accept)
        return authResult(await authClient.organization.acceptInvitation({ invitationId: id }));
      return authResult(await authClient.organization.rejectInvitation({ invitationId: id }));
    },
    onSuccess: () => window.location.assign("/organisations"),
  });
  return (
    <SettingsShell>
      <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{t("org_invitation")}</h1>
        {invitation.data && invitation.data.state !== "pending" && (
          <p role="status">{t(invitationStateLabel(invitation.data.state))}</p>
        )}
        {invitation.data?.invitation && (
          <>
            <p>{invitation.data.invitation.organizationName}</p>
            <UserIdentity user={{ email: invitation.data.invitation.email }} />
            <RoleBadge role={invitation.data.invitation.role ?? "member"} />
            <p>
              {t("invite_expires_at")}: <DateTime value={invitation.data.invitation.expiresAt} />
            </p>
            {invitation.data.state === "pending" && (
              <div className="flex gap-3">
                <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
                  {t("org_accept")}
                </Button>
                <Button
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate(false)}
                >
                  {t("org_reject")}
                </Button>
              </div>
            )}
          </>
        )}
        {(invitation.error || decide.error) && (
          <p role="alert" className="text-destructive">
            {t("account_failed")}
          </p>
        )}
      </section>
    </SettingsShell>
  );
}

function invitationStateLabel(state: string): SimpleMessageKey {
  const labels: Record<string, SimpleMessageKey> = {
    "email-mismatch": "invite_wrong_email",
    expired: "invite_expired",
    accepted: "invite_accepted",
    rejected: "invite_rejected",
    canceled: "invite_canceled",
  };
  return labels[state] ?? "invite_unavailable";
}
