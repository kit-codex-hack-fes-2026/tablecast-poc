import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { sessionOptions } from "../../lib/session-query";
import { SettingsShell } from "./settings-shell";

export function Invitation({ id }: { id: string }) {
  const { t } = useI18n();
  const session = useQuery(sessionOptions);
  const invitation = useQuery({
    queryKey: ["tablecast-invitation", id],
    queryFn: async () => authResult(await authClient.organization.getInvitation({ query: { id } })),
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
      <section className="space-y-6 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{t("org_invitation")}</h1>
        {invitation.data && (
          <>
            <p>{invitation.data.organizationName}</p>
            <p>{invitation.data.email}</p>
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
