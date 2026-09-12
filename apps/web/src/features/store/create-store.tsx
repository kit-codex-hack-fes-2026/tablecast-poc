import { zodFieldValidator } from "../../lib/form-validation";
import { createStoreSchema } from "@tablecast/api/schema";
import { useAppForm } from "../../components/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { SettingsShell } from "../shell/settings-shell";
export function CreateStore() {
  const { t, locale } = useI18n(),
    navigate = useNavigate(),
    client = useQueryClient();
  const create = useMutation({
    mutationFn: (json: { name: string; slug: string; tableCount: number }) =>
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
      <h1 className="text-2xl font-semibold">{t("stores_create")}</h1>
      <form
        noValidate
        className="max-w-xl space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
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
        <form.AppForm>
          <form.FormErrors error={create.error} />
        </form.AppForm>
        <form.AppForm>
          <form.SubmitButton>
            <Plus />
            {t("stores_create")}
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </SettingsShell>
  );
}
