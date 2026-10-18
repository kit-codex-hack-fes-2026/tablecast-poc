import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/page-header";
import { pointRulesSchema } from "@tablecast/api/schema";
import { useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { Checkbox } from "../../components/ui/checkbox";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { pointPolicyOptions } from "./point-query";
import { RewardEditorStatus } from "./reward-editor-status";
import { useStore } from "./store-shell";
export function PointPolicy() {
  const store = useStore();
  const storeId = store.id;
  const query = useSuspenseQuery(pointPolicyOptions(storeId));
  const policy = query.data;
  const canEdit = ["owner", "admin"].includes(store.role);
  const { t } = useI18n();
  const client = useQueryClient();
  const [defaults, setDefaults] = useState(policy);
  function reset(next: typeof policy): void {
    setDefaults(next);
    form.reset(next);
  }
  const save = useMutation({
    mutationFn: ({ version, rules }: typeof policy) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].points.policy.$post({
          param: { storeId },
          json: { ...rules, expectedVersion: version },
        }),
      ),
    onSuccess: (next) => {
      reset(next);
      client.setQueryData(pointPolicyOptions(storeId).queryKey, next);
    },
  });
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- 再読込はfetchQuery自身が同じpolicy cacheを更新する。
  const reload = useMutation({
    mutationFn: () => client.fetchQuery({ ...pointPolicyOptions(storeId), staleTime: 0 }),
    onSuccess: (next) => {
      reset(next);
      save.reset();
    },
  });
  const pending = save.isPending || reload.isPending;
  const form = useAppForm({
    defaultValues: defaults,
    onSubmit: async ({ value }) => {
      if (!canEdit || pending) return;
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <section className="space-y-6">
      <PageHeader title={t("customer_points_policy")} description={t("customer_points_future")} />
      <form
        className="max-w-2xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <RewardEditorStatus
          version={defaults.version}
          conflict={policy.version > defaults.version || apiError(save.error)?.status === 409}
          pending={pending}
          onReload={() => reload.mutate()}
        />
        <ErrorNotice
          error={reload.error || query.error}
          onRetry={() => (reload.error ? reload.mutate() : void query.refetch())}
          retrying={pending || query.isFetching}
        />
        <fieldset disabled={!canEdit || pending} className="space-y-5">
          <form.Field name="rules.enabled">
            {(field) => (
              <label className="flex items-center gap-3">
                <Checkbox checked={field.state.value} onCheckedChange={field.handleChange} />
                {t("customer_points_enabled")}
              </label>
            )}
          </form.Field>
          <form.Field name="rules.kind">
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
          <form.AppField
            name="rules.points"
            validators={{ onChange: pointRulesSchema.shape.points }}
          >
            {(field) => (
              <field.NumberField label={t("customer_points_rate")} min={0} max={100000} required />
            )}
          </form.AppField>
          <form.AppField
            name="rules.unitYen"
            validators={{ onChange: pointRulesSchema.shape.unitYen }}
          >
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
    </section>
  );
}
