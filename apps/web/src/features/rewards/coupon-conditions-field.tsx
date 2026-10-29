import type { z } from "zod";
import { couponConditionsSchema } from "@tablecast/api/schema";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";

type Conditions = z.infer<typeof couponConditionsSchema>;
export function CouponConditionsField({
  value,
  onChange,
}: {
  onChange: (value: Conditions) => void;
  value: Conditions | undefined;
}) {
  const { t } = useI18n();
  const conditions = value ?? { all: [], any: [] };
  const [keys, setKeys] = useState(() => ({
    all: conditions.all.map(() => crypto.randomUUID()),
    any: conditions.any.map(() => crypto.randomUUID()),
  }));
  const update = (
    group: "all" | "any",
    index: number,
    change: Partial<Conditions["all"][number]>,
  ) =>
    onChange({
      ...conditions,
      [group]: conditions[group].map((item, i) => (i === index ? { ...item, ...change } : item)),
    });
  return (
    <fieldset className="col-span-full space-y-4 rounded-xl border p-4">
      <legend className="px-1 font-medium">{t("coupon_conditions")}</legend>
      <p className="text-sm text-muted-foreground">{t("coupon_conditions_hint")}</p>
      {(["all", "any"] as const).map((group) => (
        <section key={group} className="space-y-3" aria-label={t(`coupon_conditions_${group}`)}>
          <h3 className="text-sm font-medium">{t(`coupon_conditions_${group}`)}</h3>
          {conditions[group].map((condition, index) => (
            <div key={keys[group][index]} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="grid gap-1 text-sm">
                {t("coupon_condition_field")}
                <NativeSelect
                  value={condition.field}
                  onChange={(event) => {
                    const field = couponConditionsSchema.shape.all.element.shape.field.parse(
                      event.target.value,
                    );
                    update(group, index, {
                      field,
                      value: field === "joinedAt" || field === "lastVisitAt" ? Date.now() : 1,
                    });
                  }}
                >
                  {(["visits", "spend", "joinedAt", "lastVisitAt"] as const).map((field) => (
                    <option key={field} value={field}>
                      {t(`coupon_condition_${field}`)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1 text-sm">
                {t("coupon_condition_operator")}
                <NativeSelect
                  value={condition.operator}
                  onChange={(event) =>
                    update(group, index, { operator: event.target.value === "lte" ? "lte" : "gte" })
                  }
                >
                  <option value="gte">{t("coupon_condition_gte")}</option>
                  <option value="lte">{t("coupon_condition_lte")}</option>
                </NativeSelect>
              </label>
              <label className="grid gap-1 text-sm">
                {t("coupon_condition_value")}
                {condition.field === "joinedAt" || condition.field === "lastVisitAt" ? (
                  <Input
                    type="datetime-local"
                    min="1970-01-01T09:00"
                    max="9999-12-31T23:59"
                    required
                    value={new Date(condition.value + 9 * 3600000).toISOString().slice(0, 16)}
                    onChange={(event) => {
                      const nextValue = Date.parse(event.target.value + "+09:00");
                      if (Number.isFinite(nextValue)) update(group, index, { value: nextValue });
                    }}
                  />
                ) : (
                  <Input
                    type="number"
                    min={0}
                    max={100000000}
                    step={1}
                    required
                    value={condition.value}
                    onChange={(event) =>
                      update(group, index, { value: Number(event.target.value) })
                    }
                  />
                )}
              </label>
              <Button
                type="button"
                variant="ghost"
                className="self-end"
                onClick={() => {
                  setKeys((current) => ({
                    ...current,
                    [group]: current[group].filter((_, i) => i !== index),
                  }));
                  onChange({
                    ...conditions,
                    [group]: conditions[group].filter((_, i) => i !== index),
                  });
                }}
              >
                {t("common_remove")}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={conditions[group].length >= 8}
            onClick={() => {
              setKeys((current) => ({
                ...current,
                [group]: [...current[group], crypto.randomUUID()],
              }));
              onChange({
                ...conditions,
                [group]: [...conditions[group], { field: "visits", operator: "gte", value: 1 }],
              });
            }}
          >
            {t("coupon_condition_add")}
          </Button>
        </section>
      ))}
    </fieldset>
  );
}
