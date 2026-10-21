import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../i18n/locale";
import { sessionOptions } from "../../lib/session-query";
import {
  accountKeysOptions,
  accountLinksOptions,
  accountSessionsOptions,
} from "../account/account-query";

export function useAccount(pending: boolean) {
  const { t } = useI18n();
  const session = useQuery(sessionOptions);
  const client = useQueryClient();
  const [sessions, accounts, keys] = useQueries({
    queries: [accountSessionsOptions, accountLinksOptions, accountKeysOptions],
  });
  const change = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-account"] });
      void session.refetch();
    },
  });
  const section = "min-w-0 scroll-mt-24 space-y-5 pb-8";
  return {
    t,
    session,
    sessions,
    accounts,
    keys,
    change,
    section,
    loading: pending || sessions.isPending || accounts.isPending || keys.isPending,
  };
}

export type AccountController = ReturnType<typeof useAccount>;

export type Connection = NonNullable<AccountController["accounts"]["data"]>[number];

export type Passkey = NonNullable<AccountController["keys"]["data"]>[number];

export type Session = NonNullable<AccountController["sessions"]["data"]>[number];
