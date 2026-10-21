import { ActionFeedback } from "../../components/action-feedback";
import { PageHeader } from "../../components/page-header";
import { SettingsShell } from "../store/settings-shell";
import { AccountConnections } from "./account-connections";
import { AccountPasskeys } from "./account-passkeys";
import { AccountProfile } from "./account-profile";
import { AccountSessions } from "./account-sessions";
import { useAccount } from "./account-state";

export function Account({ pending = false }: { pending?: boolean }) {
  const controller = useAccount(pending);
  const { t, change, sessions, accounts, keys } = controller;
  const error = change.error || sessions.error || accounts.error || keys.error;
  return (
    <SettingsShell>
      <PageHeader title={t("account_title")} />
      {(change.isPending || change.isSuccess || error) && (
        <ActionFeedback
          pending={change.isPending}
          error={error}
          success={change.isSuccess}
          successMessage={t("account_saved")}
        />
      )}
      <div className="@container">
        <div className="grid min-w-0 gap-7 @4xl:grid-cols-[11rem_minmax(0,1fr)]">
          <nav
            aria-label={t("account_title")}
            className="flex h-fit flex-wrap gap-1 @4xl:sticky @4xl:top-20 @4xl:flex-col"
          >
            {(
              [
                ["profile", "account_profile"],
                ["connections", "account_connections"],
                ["passkeys", "account_passkeys"],
                ["sessions", "account_sessions"],
              ] as const
            ).map(([id, label]) => (
              <a
                key={id}
                href={`#account-${id}`}
                className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                {t(label)}
              </a>
            ))}
          </nav>
          <div className="min-w-0 space-y-8">
            <AccountProfile controller={controller} />
            <AccountConnections controller={controller} />
            <AccountPasskeys controller={controller} />
            <AccountSessions controller={controller} />
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
