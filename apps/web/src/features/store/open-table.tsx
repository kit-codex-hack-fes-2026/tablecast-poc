import { useId } from "react";
import { Table2 } from "lucide-react";
import { LanguageLabel } from "../../components/language-label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { PageHeader } from "../../components/page-header";
import { Field } from "@base-ui/react/field";
import { zodFieldValidator } from "../../lib/form-validation";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { ErrorNotice } from "../../components/error-notice";
import { FieldErrors } from "../../components/ui/field-errors";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { catalogOptions } from "./menu-query";

import { parseResponse, rpc } from "../../lib/api";

const openFieldNames = { guestCount: "guests", locale: "guestLocale", planId: "plan" };

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
  const languageId = useId();
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
      <PageHeader icon={<Table2 />} title={table.name} description={t("admin_open_table")} />
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
            onChange: zodFieldValidator(z.number().int().min(1).max(30), locale),
          }}
        >
          {(field) => (
            <field.NumberField label={t("admin_guest_count")} min={1} max={30} required />
          )}
        </form.AppField>
        <form.Field name="guestLocale">
          {(field) => (
            <fieldset className="space-y-2">
              <legend id={`${languageId}-label`} className="mb-2 text-base">
                {t("admin_locale")}
              </legend>
              <RadioGroup
                aria-labelledby={`${languageId}-label`}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onValueChange={(value) => field.handleChange(value === "en" ? "en" : "ja")}
                className="grid grid-cols-2 gap-3"
              >
                {(["ja", "en"] as const).map((language) => (
                  <label
                    key={language}
                    htmlFor={`${languageId}-${language}`}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-input px-3 py-2 has-data-checked:border-primary has-data-checked:bg-info-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                  >
                    <RadioGroupItem
                      className="focus-visible:outline-none"
                      id={`${languageId}-${language}`}
                      value={language}
                    />
                    <LanguageLabel locale={language} />
                  </label>
                ))}
              </RadioGroup>
              <FieldErrors errors={field.state.meta.errors} />
            </fieldset>
          )}
        </form.Field>
        <form.Field name="plan">
          {(field) => (
            <Field.Root name={field.name} invalid={!field.state.meta.isValid}>
              <label className="flex flex-col gap-2 text-base">
                {t("kiosk_plan")}
                <NativeSelect
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
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
                <FieldErrors errors={field.state.meta.errors} />
              </label>
            </Field.Root>
          )}
        </form.Field>
        <form.AppForm>
          <form.FormErrors error={open.error} fieldNames={openFieldNames} />
        </form.AppForm>
        <ErrorNotice error={catalog.error} />
        <form.AppForm>
          <form.SubmitButton size="lg">{t("admin_open_table")}</form.SubmitButton>
        </form.AppForm>
      </form>
    </section>
  );
}
