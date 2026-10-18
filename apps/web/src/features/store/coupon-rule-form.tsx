import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { type couponDefinitionSchema, couponRuleSchema } from "@tablecast/api/schema";
import type { z } from "zod";
import { useCallback, useState } from "react";
import { useAppForm } from "../../components/form";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { Checkbox } from "../../components/ui/checkbox";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { ConfigurationImageField } from "./configuration-image-field";
import { couponRulesOptions } from "./coupon-query";
import { configurationImageUploadKey } from "./menu-query";
import { RewardEditorStatus } from "./reward-editor-status";
const dateInput = (time: number) => new Date(time + 9 * 3600000).toISOString().slice(0, 16);
type CouponDefinition = z.infer<typeof couponDefinitionSchema>;
function couponValues({ rules: { startsAt, endsAt, ...rules }, ...definition }: CouponDefinition) {
  return { ...definition, rules, start: dateInput(startsAt), end: dateInput(endsAt) };
}
export function CouponRuleForm({
  storeId,
  initial,
  onSaved,
}: {
  storeId: string;
  initial?: CouponDefinition;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const savedRules = useInfiniteQuery({ ...couponRulesOptions(storeId), enabled: false });
  const [staged, setStaged] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);
  const onStagedChange = useCallback((_: string, value: boolean) => setStaged(value), []);
  const [defaults, setDefaults] = useState(() =>
    couponValues(
      initial ?? {
        id: crypto.randomUUID(),
        expectedVersion: 0,
        active: true,
        rules: {
          title: { ja: "", en: "" },
          description: { ja: "", en: "" },
          imageKey: "",
          imageKind: "illustration" as const,
          imageSource: { generated: false, description: "" },
          startsAt: Date.now(),
          endsAt: Date.now() + 30 * 86400000,
          minimumYen: 0,
          discountKind: "fixed" as const,
          discountValue: 100,
          maximumYen: 1000,
          trigger: "enrol" as const,
          threshold: 1,
        },
      },
    ),
  );
  const uploads = useIsMutating({ mutationKey: configurationImageUploadKey(storeId) });
  function reset(next: CouponDefinition): void {
    const values = couponValues(next);
    setDefaults(values);
    form.reset(values);
    setImageRevision((revision) => revision + 1);
  }
  const save = useMutation({
    mutationFn: (json: CouponDefinition) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].coupons.rules.$post({ param: { storeId }, json }),
      ),
    onSuccess: (result, submitted) => {
      reset({ ...submitted, expectedVersion: result.version });
      void client.invalidateQueries({ queryKey: ["tablecast-coupon-rules", storeId] });
      onSaved();
    },
  });
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- refetchとfetchNextPage自身が一覧cacheを更新する。
  const reload = useMutation({
    mutationFn: async () => {
      let current = await savedRules.refetch({ throwOnError: true });
      let rule = current.data?.pages
        .flatMap((page) => page.rules)
        .find((item) => item.id === defaults.id);
      while (!rule && current.data?.pages.at(-1)?.nextCursor) {
        current = await savedRules.fetchNextPage({ throwOnError: true });
        rule = current.data?.pages
          .flatMap((page) => page.rules)
          .find((item) => item.id === defaults.id);
      }
      if (!rule) throw new Error("COUPON_RULE_NOT_FOUND");
      const { version, ...definition } = rule;
      return { ...definition, expectedVersion: version };
    },
    onSuccess: (next) => {
      reset(next);
      save.reset();
      setStaged(false);
    },
  });
  const pending = save.isPending || reload.isPending;
  const form = useAppForm({
    defaultValues: defaults,
    onSubmit: async ({ value: { start, end, ...definition } }) => {
      if (pending || staged || uploads) return;
      await save
        .mutateAsync({
          ...definition,
          rules: {
            ...definition.rules,
            startsAt: Date.parse(start + "+09:00"),
            endsAt: Date.parse(end + "+09:00"),
          },
        })
        .catch(() => undefined);
    },
  });
  return (
    <form
      className="space-y-5 rounded-xl border p-5"
      data-pwa-blocked={staged || !!uploads}
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p>{t("coupon_version_note")}</p>
      {defaults.expectedVersion > 0 && (
        <RewardEditorStatus
          version={defaults.expectedVersion}
          conflict={
            (initial?.expectedVersion ?? 0) > defaults.expectedVersion ||
            apiError(save.error)?.status === 409
          }
          pending={pending || !!uploads}
          onReload={() => reload.mutate()}
        />
      )}
      <ErrorNotice
        error={reload.error || savedRules.error}
        onRetry={() => (reload.error ? reload.mutate() : void savedRules.refetch())}
        retrying={pending || savedRules.isFetching || !!uploads}
      />
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        {(["ja", "en"] as const).map((locale) => (
          <form.AppField key={locale} name={`rules.title.${locale}`}>
            {(field) => (
              <field.TextField label={t(`coupon_title_${locale}`)} required maxLength={500} />
            )}
          </form.AppField>
        ))}
        {(["ja", "en"] as const).map((locale) => (
          <form.AppField key={locale} name={`rules.description.${locale}`}>
            {(field) => (
              <field.TextField label={t(`coupon_description_${locale}`)} required maxLength={500} />
            )}
          </form.AppField>
        ))}
        <form.AppField name="start">
          {(field) => <field.TextField type="datetime-local" label={t("coupon_start")} required />}
        </form.AppField>
        <form.AppField name="end">
          {(field) => <field.TextField type="datetime-local" label={t("coupon_end")} required />}
        </form.AppField>
        <form.Field name="active">
          {(field) => (
            <label className="flex items-center gap-3">
              <Checkbox checked={field.state.value} onCheckedChange={field.handleChange} />
              {t("coupon_active")}
            </label>
          )}
        </form.Field>
        <form.Field name="rules.discountKind">
          {(field) => (
            <label className="grid gap-2">
              {t("coupon_discount")}
              <NativeSelect
                value={field.state.value}
                onChange={(e) =>
                  field.handleChange(couponRuleSchema.shape.discountKind.parse(e.target.value))
                }
              >
                {(["fixed", "percent"] as const).map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`coupon_${kind}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
        </form.Field>
        {(
          [
            ["minimumYen", "coupon_minimum", 0],
            ["discountValue", "coupon_value", 1],
            ["maximumYen", "coupon_cap", 1],
            ["threshold", "coupon_threshold", 1],
          ] as const
        ).map(([name, label, min]) => (
          <form.AppField key={name} name={`rules.${name}`}>
            {(field) => <field.NumberField label={t(label)} min={min} required />}
          </form.AppField>
        ))}
        <form.Field name="rules.trigger">
          {(field) => (
            <label className="grid gap-2">
              {t("coupon_trigger")}
              <NativeSelect
                value={field.state.value}
                onChange={(e) =>
                  field.handleChange(couponRuleSchema.shape.trigger.parse(e.target.value))
                }
              >
                {(["enrol", "visits", "spend", "exchange", "manual"] as const).map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`coupon_${kind}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
        </form.Field>
        <div className="sm:col-span-2">
          <form.Field name="rules">
            {(field) => (
              <ConfigurationImageField
                key={imageRevision}
                storeId={storeId}
                value={field.state.value}
                disabled={pending}
                onStagedChange={onStagedChange}
                onChange={(image) =>
                  field.handleChange({
                    ...field.state.value,
                    imageKey: image.imageKey ?? "",
                    imageKind: image.imageKind,
                    imageSource: image.imageSource ?? { generated: false, description: "" },
                  })
                }
              />
            )}
          </form.Field>
        </div>
        <form.AppForm>
          <form.SubmitButton disabled={staged || !!uploads}>{t("account_save")}</form.SubmitButton>
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
