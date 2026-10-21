import type { z } from "zod";
import { type couponDefinitionSchema, couponRuleSchema } from "@tablecast/api/schema";
import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Ticket } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { ConfigurationImageField } from "../configuration/configuration-image-field";
import { LanguageFields } from "../configuration/language-fields";
import { configurationImageUploadKey } from "../configuration/menu-query";
import { couponRulesOptions } from "./coupon-query";
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
  onCancel,
}: {
  initial?: CouponDefinition;
  onCancel?: () => void;
  onSaved: () => void;
  storeId: string;
}) {
  const { t, locale } = useI18n();
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
          <Ticket aria-hidden="true" className="size-5 shrink-0" />
          {initial ? initial.rules.title[locale] : t("coupon_new")}
        </h2>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={pending || !!uploads}
            onClick={onCancel}
          >
            {t("common_cancel")}
          </Button>
        )}
      </div>
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
      <fieldset
        disabled={pending}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-5"
      >
        <div className="col-span-full">
          <LanguageFields>
            {(language) => (
              <>
                <form.AppField name={`rules.title.${language}`}>
                  {(field) => (
                    <field.TextField
                      label={t(`coupon_title_${language}`)}
                      required
                      maxLength={500}
                    />
                  )}
                </form.AppField>
                <form.AppField name={`rules.description.${language}`}>
                  {(field) => (
                    <field.TextField
                      label={t(`coupon_description_${language}`)}
                      required
                      maxLength={500}
                    />
                  )}
                </form.AppField>
              </>
            )}
          </LanguageFields>
        </div>
        <form.AppField name="start">
          {(field) => <field.DateField includeTime label={t("coupon_start")} required />}
        </form.AppField>
        <form.AppField name="end">
          {(field) => <field.DateField includeTime label={t("coupon_end")} required />}
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
        <div className="col-span-full">
          <form.Field name="rules">
            {(field) => (
              <ConfigurationImageField
                key={imageRevision}
                storeId={storeId}
                value={field.state.value}
                disabled={pending}
                saveHint={t("coupon_version_note")}
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
