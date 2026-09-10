import { createFileRoute } from "@tanstack/react-router";
import { Account } from "../features/account/account";
import {
  accountKeysOptions,
  accountLinksOptions,
  accountSessionsOptions,
} from "../features/account/account-query";
export const Route = createFileRoute("/account")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(accountSessionsOptions),
      context.queryClient.ensureQueryData(accountLinksOptions),
      context.queryClient.ensureQueryData(accountKeysOptions),
    ]);
  },
  component: () => <Account />,
});
