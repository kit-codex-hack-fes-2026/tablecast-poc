import { CalendarDays, KeyRound, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import type { AccountController, Passkey } from "./account-state";
import { ConfirmAction } from "../../components/confirm-action";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { useAppForm } from "../../components/form";
import { authClient, authResult } from "../../lib/auth-client";
import { useCollectionSearch } from "../shell/collection-search";

export function AccountPasskeys({ controller }: { controller: AccountController }) {
  const { t, keys, change, section } = controller;
  const collection = useCollectionSearch({ prefix: "passkeys", sortIds: ["name", "createdAt"] });
  const columns = useMemo(
    () => passkeyColumns(t, change.isPending || controller.loading, change.mutate),
    [t, change.isPending, controller.loading, change.mutate],
  );
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value, formApi }) => {
      await change
        .mutateAsync(async () => {
          authResult(await authClient.passkey.addPasskey({ name: value.name || "TableCast" }));
        })
        .then(() => formApi.reset(value))
        .catch(() => undefined);
    },
  });
  return (
    <section id="account-passkeys" aria-labelledby="account-passkeys-title" className={section}>
      <h2 id="account-passkeys-title" className="flex items-center gap-2 text-lg font-semibold">
        <KeyRound />
        {t("account_passkeys")}
      </h2>
      <DataTable
        {...collection}
        searchLabel={t("account_passkeys_search")}
        searchPlaceholder={t("account_passkeys_search")}
        data={keys.data ?? []}
        pending={keys.isPending}
        error={keys.error}
        onRetry={() => void keys.refetch()}
        columns={columns}
        getRowId={(row) => row.id}
        empty={t("account_no_passkeys")}
      />
      <form
        noValidate
        className="flex max-w-2xl flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="min-w-48 flex-1">
          <form.AppField name="name" validators={{ onChange: z.string().max(100) }}>
            {(field) => (
              <field.TextField
                label={t("account_key_name")}
                maxLength={100}
                disabled={controller.loading}
              />
            )}
          </form.AppField>
        </div>
        <form.AppForm>
          <form.SubmitButton disabled={change.isPending || controller.loading}>
            <Plus />
            {t("account_add_passkey")}
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </section>
  );
}

function passkeyColumns(
  t: AccountController["t"],
  pending: boolean,
  change: (action: () => Promise<void>) => void,
): DataTableColumn<Passkey>[] {
  return [
    {
      id: "name",
      accessorFn: (row) => row.name || t("account_passkeys"),
      meta: { icon: KeyRound },
      header: t("account_key_name"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <KeyRound />
          {row.original.name || t("account_passkeys")}
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      meta: { icon: CalendarDays },
      header: t("mcp_connected_at"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    {
      id: "actions",
      header: t("account_remove"),
      cell: ({ row }) => (
        <ConfirmAction
          label={t("account_remove")}
          subject={row.original.name || t("account_passkeys")}
          disabled={pending}
          icon={<Trash2 />}
          onConfirm={() =>
            change(async () => {
              authResult(await authClient.passkey.deletePasskey({ id: row.original.id }));
            })
          }
        />
      ),
    },
  ];
}
