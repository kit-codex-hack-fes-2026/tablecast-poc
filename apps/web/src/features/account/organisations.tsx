import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { TeamMembers } from "./team-members";
import { SettingsShell } from "./settings-shell";

export function Organisations() {
  const { t } = useI18n();
  const session = authClient.useSession();
  const client = useQueryClient();
  const [selected, setSelected] = useState("");
  const [teamName, setTeamName] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin" | "owner">("member");
  const [teamId, setTeamId] = useState("");
  const list = useQuery({
    queryKey: ["tablecast-organisations"],
    queryFn: async () => authResult(await authClient.organization.list()),
    enabled: !!session.data,
  });
  const id = selected || list.data?.[0]?.id;
  const detail = useQuery({
    queryKey: ["tablecast-organisations", id],
    queryFn: async () =>
      authResult(
        await authClient.organization.getFullOrganization({ query: { organizationId: id } }),
      ),
    enabled: !!id,
  });
  const teams = useQuery({
    queryKey: ["tablecast-organisations", id, "teams"],
    queryFn: async () =>
      authResult(await authClient.organization.listTeams({ query: { organizationId: id } })),
    enabled: !!id,
  });
  const myRole = detail.data?.members.find((item) => item.userId === session.data?.user.id)?.role;
  const manager = myRole === "owner" || myRole === "admin";
  const change = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-organisations"] });
    },
  });
  const roleOptions = (
    <>
      <option value="member">{t("org_member")}</option>
      <option value="admin">{t("org_admin")}</option>
      {myRole === "owner" && <option value="owner">{t("org_owner")}</option>}
    </>
  );
  const card = "space-y-4 rounded-2xl border border-border bg-white p-6 shadow-sm";
  return (
    <SettingsShell>
      <h1 className="text-2xl font-semibold">{t("org_title")}</h1>
      {(change.error || list.error || detail.error || teams.error) && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">
          {t("account_failed")}
        </p>
      )}
      {change.isSuccess && <output>{t("account_saved")}</output>}
      <label className="block max-w-sm space-y-2">
        {t("org_select")}
        <NativeSelect
          value={id ?? ""}
          onChange={(event) => {
            setSelected(event.target.value);
            setTeamId("");
          }}
        >
          {list.data?.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <section className={card}>
        <h2 className="text-lg font-semibold">{t("org_create")}</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            change.mutate(async () => {
              const org = authResult(await authClient.organization.create({ name, slug }));
              setSelected(org.id);
              setName("");
              setSlug("");
            });
          }}
        >
          <label>
            {t("org_name")}
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
          </label>
          <label>
            {t("org_slug")}
            <Input
              required
              pattern="[a-z0-9-]+"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              maxLength={80}
            />
          </label>
          <Button type="submit" disabled={change.isPending}>
            {t("org_create")}
          </Button>
        </form>
      </section>
      {detail.data && (
        <>
          <section className={card}>
            <h2 className="text-lg font-semibold">{t("org_members")}</h2>
            {detail.data.members.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div>
                  <p className="font-medium">{member.user.name}</p>
                  <p className="text-sm text-muted-foreground">{member.user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    aria-label={`${t("org_role")} ${member.user.email}`}
                    value={member.role}
                    disabled={
                      !manager ||
                      change.isPending ||
                      (member.role === "owner" && myRole !== "owner")
                    }
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === "owner" || next === "admin" || next === "member")
                        change.mutate(async () =>
                          authResult(
                            await authClient.organization.updateMemberRole({
                              organizationId: id,
                              memberId: member.id,
                              role: next,
                            }),
                          ),
                        );
                    }}
                  >
                    {roleOptions}
                  </NativeSelect>
                  {manager && (
                    <Button
                      variant="outline"
                      disabled={
                        change.isPending ||
                        member.userId === session.data?.user.id ||
                        (member.role === "owner" && myRole !== "owner")
                      }
                      onClick={() =>
                        change.mutate(async () =>
                          authResult(
                            await authClient.organization.removeMember({
                              organizationId: id,
                              memberIdOrEmail: member.id,
                            }),
                          ),
                        )
                      }
                    >
                      {t("account_remove")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </section>
          {manager && id && (
            <section className={card}>
              <h2 className="text-lg font-semibold">{t("org_team")}</h2>
              <form
                className="flex items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  change.mutate(async () => {
                    authResult(
                      await authClient.organization.createTeam({
                        organizationId: id,
                        name: teamName,
                      }),
                    );
                    setTeamName("");
                  });
                }}
              >
                <label>
                  {t("org_team_name")}
                  <Input
                    value={teamName}
                    required
                    maxLength={100}
                    onChange={(event) => setTeamName(event.target.value)}
                  />
                </label>
                <Button type="submit" disabled={change.isPending}>
                  {t("org_create_team")}
                </Button>
              </form>
              {teams.data?.map((team) => (
                <details key={team.id} className="rounded-xl border border-border p-4">
                  <summary className="cursor-pointer font-medium">{team.name}</summary>
                  <TeamMembers teamId={team.id} organizationId={id} members={detail.data.members} />
                </details>
              ))}
            </section>
          )}
          {manager && (
            <section className={card}>
              <h2 className="text-lg font-semibold">{t("org_invite")}</h2>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  change.mutate(async () => {
                    authResult(
                      await authClient.organization.inviteMember({
                        organizationId: id,
                        email,
                        role,
                        ...(teamId ? { teamId } : {}),
                      }),
                    );
                    setEmail("");
                  });
                }}
              >
                <label>
                  {t("auth_email")}
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label>
                  {t("org_role")}
                  <NativeSelect
                    value={role}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === "owner" || next === "admin" || next === "member") setRole(next);
                    }}
                  >
                    {roleOptions}
                  </NativeSelect>
                </label>
                <label>
                  {t("org_team")}
                  <NativeSelect value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                    <option value="">{t("org_no_team")}</option>
                    {teams.data?.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <Button type="submit" disabled={change.isPending}>
                  {t("org_send_invitation")}
                </Button>
              </form>
              {detail.data.invitations
                .filter((invitation) => invitation.status === "pending")
                .map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
                  >
                    <span>
                      {invitation.email} · {invitation.role}
                    </span>
                    <Button
                      variant="outline"
                      disabled={change.isPending}
                      onClick={() =>
                        change.mutate(async () =>
                          authResult(
                            await authClient.organization.cancelInvitation({
                              invitationId: invitation.id,
                            }),
                          ),
                        )
                      }
                    >
                      {t("org_cancel_invitation")}
                    </Button>
                  </div>
                ))}
            </section>
          )}
        </>
      )}
    </SettingsShell>
  );
}
