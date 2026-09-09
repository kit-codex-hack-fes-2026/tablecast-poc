import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { ErrorNotice } from "../../components/error-notice";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { catalogOptions } from "./menu-query";

import { parseResponse, rpc } from "../../lib/api";

export function OpenTable({
  storeId,
  table,
  onOpened,
}: {
  storeId: string;
  table: { id: string; name: string };
  onOpened: () => void;
}) {
  const { t, locale } = useI18n();
  const catalog = useSuspenseQuery(catalogOptions(storeId));
  const client = useQueryClient();
  const open = useMutation({
    mutationFn: ({
      guests,
      guestLocale,
      plan,
    }: {
      guests: number;
      guestLocale: "ja" | "en";
      plan: string;
    }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables.open.$post({
          param: { storeId: storeId },
          json: {
            tableId: table.id,
            guestCount: guests,
            locale: guestLocale,
            ...(plan ? { planId: plan } : {}),
          },
        }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-admin", storeId] });
      onOpened();
    },
  });
  const form = useAppForm({
    defaultValues: { guests: 2, guestLocale: "ja" as "ja" | "en", plan: "" },
    onSubmit: async ({ value }) => {
      await open.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <section className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">
        {table.name} · {t("admin_open_table")}
      </h1>
      <form
        noValidate
        className="flex flex-col gap-4 pt-6"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppField
          name="guests"
          validators={{
            onChange: z
              .number({ error: t("form_number") })
              .int(t("form_number"))
              .min(1, t("form_number"))
              .max(30, t("form_number")),
          }}
        >
          {(field) => (
            <field.NumberField label={t("admin_guest_count")} min={1} max={30} required />
          )}
        </form.AppField>
        <form.Field name="guestLocale">
          {(field) => (
            <label className="flex flex-col gap-2 text-base">
              {t("admin_locale")}
              <NativeSelect
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value === "en" ? "en" : "ja")}
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </NativeSelect>
            </label>
          )}
        </form.Field>
        <form.Field name="plan">
          {(field) => (
            <label className="flex flex-col gap-2 text-base">
              {t("kiosk_plan")}
              <NativeSelect
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              >
                <option value="">{t("admin_no_plan")}</option>
                {catalog.data.configuration.plans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.text[locale].displayName}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
        </form.Field>
        <ErrorNotice error={open.error || catalog.error} />
        <form.AppForm>
          <form.SubmitButton size="lg">{t("admin_open_table")}</form.SubmitButton>
        </form.AppForm>
      </form>
    </section>
  );
}
