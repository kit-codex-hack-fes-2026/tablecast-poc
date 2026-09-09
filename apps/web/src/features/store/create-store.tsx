import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { SettingsShell } from "../account/settings-shell";
export function CreateStore() {
  const { t } = useI18n(),
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
  const form = useForm({
    defaultValues: { name: "", slug: "", tableCount: 10 },
    onSubmit: ({ value }) => {
      create.mutate(value);
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
        className="max-w-xl space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <label className="flex flex-col gap-2">
              {t("org_name")}
              <Input
                required
                maxLength={150}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <label className="flex flex-col gap-2">
              {t("org_slug")}
              <Input
                required
                pattern="[a-z0-9-]+"
                maxLength={80}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="tableCount">
          {(field) => (
            <label className="flex flex-col gap-2">
              {t("stores_table_count")}
              <Input
                type="number"
                min={1}
                max={100}
                required
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.valueAsNumber)}
              />
            </label>
          )}
        </form.Field>
        <ErrorNotice error={create.error} />
        <Button type="submit" disabled={create.isPending}>
          <Plus />
          {t("stores_create")}
        </Button>
      </form>
    </SettingsShell>
  );
}
