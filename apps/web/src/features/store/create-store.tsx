import type { z } from "zod";
import { createStoreSchema } from "@tablecast/api/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { useAppForm } from "../../components/form";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { zodFieldValidator } from "../../lib/form-validation";
import { SettingsShell } from "./settings-shell";
export function CreateStore() {
  const { t, locale } = useI18n(),
    navigate = useNavigate(),
    client = useQueryClient();
  const create = useMutation({
    mutationFn: (json: z.input<typeof createStoreSchema>) =>
      parseResponse(rpc.api.admin.stores.$post({ json })),
    onSuccess: async (store) => {
      await client.invalidateQueries({ queryKey: ["tablecast-stores"] });
      await client.invalidateQueries({ queryKey: ["tablecast-organisations"] });
      await navigate({
        to: "/admin/stores/$storeId/menu/$section",
        params: { storeId: store.id, section: "products" },
      });
    },
  });
  const form = useAppForm({
    defaultValues: { name: "", slug: "", tableCount: 10 },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <SettingsShell>
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        render={<Link to="/organisations" />}
      >
        <ArrowLeft />
        {t("stores_title")}
      </Button>
      <PageHeader title={t("stores_create")} />
      <form.AppForm>
        <form.Form noValidate className="max-w-xl space-y-5">
          <form.AppField
            name="name"
            validators={{
              onChange: zodFieldValidator(createStoreSchema.shape.name, locale),
            }}
          >
            {(field) => <field.TextField label={t("org_name")} required maxLength={150} />}
          </form.AppField>
          <form.AppField
            name="slug"
            validators={{
              onChange: zodFieldValidator(createStoreSchema.shape.slug, locale, t("form_slug")),
            }}
          >
            {(field) => (
              <field.TextField
                label={t("org_slug")}
                description={t("form_slug")}
                required
                maxLength={80}
              />
            )}
          </form.AppField>
          <form.AppField
            name="tableCount"
            validators={{
              onChange: zodFieldValidator(createStoreSchema.shape.tableCount, locale),
            }}
          >
            {(field) => (
              <field.NumberField label={t("stores_table_count")} required min={1} max={100} />
            )}
          </form.AppField>

          <form.FormErrors error={create.error} />

          <form.SubmitButton>
            <Plus />
            {t("stores_create")}
          </form.SubmitButton>
        </form.Form>
      </form.AppForm>
    </SettingsShell>
  );
}
