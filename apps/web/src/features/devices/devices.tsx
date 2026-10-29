import { Field } from "@base-ui/react/field";
import { useStore as useFormStore } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { DataTable } from "../../components/data-table";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { FieldErrors } from "../../components/ui/field-errors";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { zodFieldValidator } from "../../lib/form-validation";
import { useCollectionSearch } from "../shell/collection-search";
import { useStore } from "../store/store-context";
import { deviceColumns, registrationColumns } from "./device-columns";
import { DeviceQrReader } from "./device-qr-reader";
import { devicesOptions } from "./devices-query";

export function Devices() {
  const collection = useCollectionSearch({
    sortIds: ["tableName", "status", "createdAt", "approvedBy", "revokedAt"],
  });
  const { id: storeId } = useStore();
  const { t } = useI18n();
  const client = useQueryClient();
  const devices = useSuspenseQuery(devicesOptions(storeId));
  const revoke = useMutation({
    mutationFn: (id: string) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].devices[":id"].revoke.$post({ param: { storeId, id } }),
      ),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["tablecast-devices", storeId] }),
        client.invalidateQueries({ queryKey: ["tablecast-home", storeId] }),
      ]),
  });
  const columns = useMemo(
    () => deviceColumns(t, revoke.isPending, revoke.mutate),
    [t, revoke.isPending, revoke.mutate],
  );
  return (
    <>
      <PageHeader
        title={t("device_title")}
        actions={
          <Button
            nativeButton={false}
            role="link"
            render={<Link to="/admin/stores/$storeId/devices/new" params={{ storeId }} />}
          >
            <Plus />
            {t("admin_pair")}
          </Button>
        }
      />
      <ErrorNotice error={devices.error || revoke.error} onRetry={() => void devices.refetch()} />
      <DataTable
        defaultSort={{ id: "createdAt", desc: true }}
        {...collection}
        data={devices.data.devices}
        columns={columns}
        getRowId={(row) => row.id}
        tableLabel={t("device_title")}
        searchLabel={t("device_search")}
        searchPlaceholder={t("collection_search_devices_placeholder")}
        empty={t("device_empty")}
      />
    </>
  );
}

export function RegisterDevice({
  userCode: initialCode,
  tableId: initialTableId,
}: {
  tableId?: string;
  userCode: string;
}) {
  const collection = useCollectionSearch({ sortIds: ["name"] });
  const hydrated = useHydrated();
  const [tableId, setTableId] = useState(initialTableId);
  const { id: storeId } = useStore();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const devices = useSuspenseQuery(devicesOptions(storeId));
  const approve = useMutation({
    mutationFn: (userCode: string) => {
      if (!tableId) throw new Error("TABLE_REQUIRED");
      return parseResponse(
        rpc.api.admin.stores[":storeId"].devices.approve.$post({
          param: { storeId },
          json: { userCode, tableId },
        }),
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-devices", storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-home", storeId] });
      void navigate({ to: "/admin/stores/$storeId/devices", params: { storeId } });
    },
  });
  const form = useAppForm({
    defaultValues: { userCode: initialCode },
    onSubmit: async ({ value }) => {
      await approve.mutateAsync(value.userCode).catch(() => undefined);
    },
  });
  const userCode = useFormStore(form.store, (state) => state.values.userCode);
  const columns = useMemo(
    () =>
      registrationColumns(t, tableId, (nextTableId) => {
        setTableId(nextTableId);
        void navigate({
          to: "/admin/stores/$storeId/devices/new",
          params: { storeId },
          search: (previous) => ({ ...previous, user_code: userCode, tableId: nextTableId }),
          replace: true,
        });
      }),
    [t, tableId, navigate, storeId, userCode],
  );
  return (
    <section className="space-y-6">
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        render={<Link to="/admin/stores/$storeId/devices" params={{ storeId }} />}
      >
        <ArrowLeft />
        {t("device_title")}
      </Button>
      <PageHeader title={t("admin_pair")} description={t("device_register_note")} />
      <DeviceQrReader
        onRead={(code) => {
          form.setFieldValue("userCode", code);
          void navigate({
            to: "/admin/stores/$storeId/devices/new",
            params: { storeId },
            search: (previous) => ({ ...previous, user_code: code, tableId }),
            replace: true,
          });
        }}
      />
      <form.AppForm>
        <form.Form data-pwa-blocked={tableId !== initialTableId} noValidate className="space-y-5">
          <fieldset disabled={!hydrated} className="space-y-5">
            <form.Field
              name="userCode"
              validators={{
                onChange: zodFieldValidator(
                  z.string().trim().min(1, t("form_required")).max(30),
                  locale,
                ),
              }}
            >
              {(field) => (
                <Field.Root
                  name={field.name}
                  invalid={field.state.meta.isTouched && !field.state.meta.isValid}
                  className="flex max-w-sm flex-col gap-2"
                >
                  <Field.Label>{t("admin_pair_code")}</Field.Label>
                  <Input
                    autoComplete="off"
                    required
                    maxLength={30}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      const code = event.target.value.toUpperCase();
                      field.handleChange(code);
                      void navigate({
                        to: "/admin/stores/$storeId/devices/new",
                        params: { storeId },
                        search: (previous) => ({ ...previous, user_code: code, tableId }),
                        replace: true,
                      });
                    }}
                  />
                  {field.state.meta.isTouched && <FieldErrors errors={field.state.meta.errors} />}
                </Field.Root>
              )}
            </form.Field>
            <DataTable
              defaultSort={{ id: "name", desc: false }}
              {...collection}
              data={devices.data.tables}
              columns={columns}
              getRowId={(row) => row.id}
              tableLabel={t("admin_pair_table")}
              searchLabel={t("device_search_table")}
              searchPlaceholder={t("collection_search_tables_placeholder")}
            />
            <ErrorNotice query={devices} />

            <form.FormErrors error={approve.error} />
            <form.SubmitButton disabled={!tableId}>
              <Check />
              {t("admin_approve")}
            </form.SubmitButton>
          </fieldset>
        </form.Form>
      </form.AppForm>
    </section>
  );
}
