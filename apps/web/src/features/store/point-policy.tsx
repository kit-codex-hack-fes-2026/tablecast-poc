import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { pointRulesSchema } from "@tablecast/api/schema";
import { ActionFeedback } from "../../components/action-feedback";
import { useAppForm } from "../../components/form";
import { Checkbox } from "../../components/ui/checkbox";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { pointPolicyOptions } from "./point-query";
import { useStore } from "./store-shell";
export function PointPolicy() {
  const store = useStore();
  const query = useSuspenseQuery(pointPolicyOptions(store.id));
  const { t } = useI18n();
  return (
    <section className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("customer_points_policy")}</h1>
      <p>{t("customer_points_future")}</p>
      <PointPolicyForm
        key={query.data.version}
        storeId={store.id}
        policy={query.data}
        canEdit={["owner", "admin"].includes(store.role)}
      />
    </section>
  );
}
function PointPolicyForm({
  storeId,
  policy,
  canEdit,
}: {
  storeId: string;
  policy: Awaited<ReturnType<NonNullable<ReturnType<typeof pointPolicyOptions>["queryFn"]>>>;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (rules: typeof policy.rules) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].points.policy.$post({
          param: { storeId },
          json: { ...rules, expectedVersion: policy.version },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tablecast-point-policy", storeId] }),
  });
  const form = useAppForm({
    defaultValues: policy.rules,
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <fieldset disabled={!canEdit || save.isPending} className="space-y-5">
        <form.Field name="enabled">
          {(field) => (
            <label className="flex items-center gap-3">
              <Checkbox checked={field.state.value} onCheckedChange={field.handleChange} />
              {t("customer_points_enabled")}
            </label>
          )}
        </form.Field>
        <form.Field name="kind">
          {(field) => (
            <label className="flex flex-col gap-2">
              {t("customer_points_kind")}
              <NativeSelect
                value={field.state.value}
                onChange={(e) =>
                  field.handleChange(pointRulesSchema.shape.kind.parse(e.target.value))
                }
              >
                <option value="visit">{t("customer_points_visit")}</option>
                <option value="spend">{t("customer_points_spend")}</option>
              </NativeSelect>
            </label>
          )}
        </form.Field>
        <form.AppField name="points" validators={{ onChange: pointRulesSchema.shape.points }}>
          {(field) => (
            <field.NumberField label={t("customer_points_rate")} min={0} max={100000} required />
          )}
        </form.AppField>
        <form.AppField name="unitYen" validators={{ onChange: pointRulesSchema.shape.unitYen }}>
          {(field) => (
            <field.NumberField label={t("customer_points_unit")} min={1} max={1000000} required />
          )}
        </form.AppField>
        <form.AppForm>
          <form.SubmitButton>{t("account_save")}</form.SubmitButton>
        </form.AppForm>
      </fieldset>
      <ActionFeedback
        pending={save.isPending}
        error={save.error}
        success={save.isSuccess}
        successMessage={t("account_saved")}
      />
    </form>
  );
}
