import { ImagePlus, ShieldCheck, UserRound } from "lucide-react";
import { z } from "zod";
import type { useAccount } from "./account-state";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { UserIdentity } from "../../components/user-identity";
import { parseResponse, rpc } from "../../lib/api";
import { authClient, authResult } from "../../lib/auth-client";

export function AccountProfile({ controller }: { controller: ReturnType<typeof useAccount> }) {
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
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-4 hover:bg-secondary focus-within:outline-3 focus-within:outline-offset-2">
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
      <form.AppForm>
        <form.Form noValidate className="flex max-w-2xl flex-wrap items-end gap-3">
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

          <form.SubmitButton disabled={change.isPending || controller.loading}>
            {t("account_save")}
          </form.SubmitButton>
        </form.Form>
      </form.AppForm>
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
