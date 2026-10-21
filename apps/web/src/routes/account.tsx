import { createFileRoute } from "@tanstack/react-router";
import { RouteError } from "../components/route-state";
import { Account } from "../features/account/account";
import { accountSearchSchema } from "../features/account/account-model";
import {
  accountKeysOptions,
  accountLinksOptions,
  accountSessionsOptions,
} from "../features/account/account-query";
import { SettingsShell } from "../features/store/settings-shell";
export const Route = createFileRoute("/account")({
  validateSearch: accountSearchSchema,
  staticData: { document: { title: "account_title", description: "head_account_description" } },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(accountSessionsOptions),
      context.queryClient.ensureQueryData(accountLinksOptions),
      context.queryClient.ensureQueryData(accountKeysOptions),
    ]);
  },
  pendingComponent: () => <Account pending />,
  errorComponent: (props) => (
    <SettingsShell>
      <RouteError {...props} />
    </SettingsShell>
  ),
  component: () => <Account />,
});
