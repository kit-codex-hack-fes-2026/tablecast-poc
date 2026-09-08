import { Building2, MailPlus, Plus, Store, Trash2, Users, X } from "lucide-react";
import { UserIdentity } from "../../components/user-identity";
import { ConfirmAction } from "../../components/confirm-action";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
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
  const active = authClient.useActiveOrganization();
  const [creating, setCreating] = useState(false);
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
  const id = active.data?.id ?? list.data?.[0]?.id;
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
      <option value="owner" disabled={myRole !== "owner"}>
        {t("org_owner")}
      </option>
    </>
  );
  const card = "space-y-5 rounded-2xl border border-border bg-white p-4 sm:p-5";
  return (
    <SettingsShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("org_title")}</h1>
        {!!list.data?.length && (
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus />
            {t("org_create")}
          </Button>
        )}
      </div>
      {list.isPending && (
        <div className="min-h-96 rounded-2xl border border-border p-5" aria-busy="true">
          {t("account_loading")}
        </div>
      )}
      {!list.isPending && list.data?.length === 0 && (
        <section className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-input p-6 text-center">
          <Building2 className="size-10" />
          <h2 className="text-xl">{t("org_empty_title")}</h2>
          <p className="max-w-lg text-base text-muted-foreground">{t("org_empty_hint")}</p>
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("org_create")}
          </Button>
        </section>
      )}
      {id && detail.isPending && (
        <div className="min-h-96 rounded-2xl border border-border p-5" aria-busy="true">
          {t("account_loading")}
        </div>
      )}
      {(change.error || list.error || detail.error || teams.error) && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">
          {t("account_failed")}
        </p>
      )}
      <output className="sr-only" aria-live="polite">
        {change.isSuccess && t("account_saved")}
      </output>
      {detail.data && (
        <>
          <section className={card}>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="size-5" />
              {t("org_members")}
            </h2>
            {detail.data.members.map((member) => (
              <div
                key={member.id}
                className="grid grid-cols-1 items-center gap-3 border-b border-border py-4 last:border-0 lg:grid-cols-2"
              >
                <UserIdentity user={member.user} />
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {!manager || (member.role === "owner" && myRole !== "owner") ? (
                    <span className="inline-flex min-h-12 w-36 items-center rounded-lg bg-secondary px-3 text-base font-medium">
                      {t(
                        member.role === "owner"
                          ? "org_owner"
                          : member.role === "admin"
                            ? "org_admin"
                            : "org_member",
                      )}
                    </span>
                  ) : (
                    <NativeSelect
                      className="w-36"
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
                  )}
                  {manager && (
                    <ConfirmAction
                      label={t("account_remove")}
                      subject={`${member.user.name} · ${member.user.email}`}
                      icon={<Trash2 />}
                      disabled={
                        change.isPending ||
                        member.userId === session.data?.user.id ||
                        (member.role === "owner" && myRole !== "owner")
                      }
                      onConfirm={() =>
                        change.mutate(async () =>
                          authResult(
                            await authClient.organization.removeMember({
                              organizationId: id,
                              memberIdOrEmail: member.id,
                            }),
                          ),
                        )
                      }
                    />
                  )}
                </div>
              </div>
            ))}
          </section>
          {manager && id && (
            <section className={card}>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Store className="size-5" />
                {t("org_team")}
              </h2>
              <form
                className="flex flex-wrap items-end gap-3"
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
                  <Plus />
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
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <MailPlus className="size-5" />
                {t("org_invite")}
              </h2>
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
                        ...(teams.data?.some((team) => team.id === teamId) ? { teamId } : {}),
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
                  <MailPlus />
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
                    <ConfirmAction
                      label={t("org_cancel_invitation")}
                      subject={invitation.email}
                      icon={<X />}
                      disabled={change.isPending}
                      onConfirm={() =>
                        change.mutate(async () =>
                          authResult(
                            await authClient.organization.cancelInvitation({
                              invitationId: invitation.id,
                            }),
                          ),
                        )
                      }
                    />
                  </div>
                ))}
            </section>
          )}
        </>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{t("org_create")}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("common_close")}
              onClick={() => setCreating(false)}
            >
              <X />
            </Button>
          </div>{" "}
          <div className="space-y-4">
            {change.error && (
              <p role="alert" className="text-destructive">
                {t("account_failed")}
              </p>
            )}
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                change.mutate(async () => {
                  const org = authResult(await authClient.organization.create({ name, slug }));
                  authResult(await authClient.organization.setActive({ organizationId: org.id }));
                  setCreating(false);
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
                <Plus />
                {t("org_create")}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsShell>
  );
}
