import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { CircleDollarSign } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { zodFieldValidator } from "../../lib/form-validation";

export function PaymentForm({
  storeId,
  sessionId,
  closed = false,
}: {
  closed?: boolean;
  sessionId: string;
  storeId: string;
}) {
  const { t, locale } = useI18n();
  const hydrated = useHydrated();
  const [editing, setEditing] = useState(!closed);
  const trigger = useRef<HTMLButtonElement>(null);
  const initialKind: "adjustment" | "payment" = closed ? "adjustment" : "payment";
  const client = useQueryClient();
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const payment = useMutation({
    mutationFn: (value: { amount: number; kind: "adjustment" | "payment"; reason: string }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].payments.$post({
          param: { storeId, id: sessionId },
          json: { ...value, idempotencyKey: paymentKey },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, sessionId] }),
        client.invalidateQueries({ queryKey: ["tablecast-admin", storeId] }),
      ]);
    },
  });
  const form = useAppForm({
    defaultValues: { amount: Number.NaN, kind: initialKind, reason: "" },
    listeners: { onChange: () => setPaymentKey(crypto.randomUUID()) },
    onSubmit: async ({ value }) => {
      try {
        await payment.mutateAsync(value);
        form.reset({ amount: Number.NaN, kind: value.kind, reason: "" });
        setPaymentKey(crypto.randomUUID());
      } catch {
        // 再送には入力と冪等キーを保持し、mutationの失敗を下に表示する。
      }
    },
  });
  if (!editing)
    return (
      <Button ref={trigger} variant="outline" disabled={!hydrated} onClick={() => setEditing(true)}>
        <CircleDollarSign aria-hidden="true" />
        {t("admin_adjustment")}
      </Button>
    );
  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) => (
          <>
            <h3 className="flex items-center gap-2 font-semibold">
              <CircleDollarSign aria-hidden="true" className="size-5" />
              {t(kind === "payment" ? "admin_payment" : "admin_adjustment")}
            </h3>
            {kind === "payment" && (
              <p className="text-sm text-muted-foreground">{t("admin_payment_note")}</p>
            )}
          </>
        )}
      </form.Subscribe>
      <fieldset disabled={payment.isPending} className="space-y-4">
        <form.Field name="kind">
          {(field) => (
            <RadioGroup
              name="paymentKind"
              value={field.state.value}
              disabled={!hydrated || payment.isPending}
              onValueChange={(value) => {
                if (value === "payment" || value === "adjustment") field.handleChange(value);
              }}
              className="flex flex-wrap gap-5"
            >
              <label className="flex min-h-11 items-center gap-2 text-base">
                <RadioGroupItem value="payment" />
                {t("admin_payment")}
              </label>
              <label className="flex min-h-11 items-center gap-2 text-base">
                <RadioGroupItem value="adjustment" />
                {t("admin_adjustment")}
              </label>
            </RadioGroup>
          )}
        </form.Field>
        <form.AppField
          name="amount"
          validators={{
            onChangeListenTo: ["kind"],
            onChange: ({ value, fieldApi }) =>
              Number.isNaN(value)
                ? t("form_required")
                : zodFieldValidator(
                    fieldApi.form.getFieldValue("kind") === "payment"
                      ? z.number().int().min(1)
                      : z.number().int(),
                    locale,
                  )({ value }),
          }}
        >
          {(field) => <field.NumberField label={t("admin_amount")} step={1} required />}
        </form.AppField>
        <form.AppField
          name="reason"
          validators={{
            onChange: zodFieldValidator(
              z.string().trim().min(1, t("form_required")).max(500),
              locale,
            ),
          }}
        >
          {(field) => <field.TextField label={t("admin_reason")} required maxLength={500} />}
        </form.AppField>
        <form.AppForm>
          <form.FormErrors error={payment.error} />
        </form.AppForm>
        <div className="flex flex-wrap items-center gap-3">
          {closed && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.reset();
                payment.reset();
                setPaymentKey(crypto.randomUUID());
                setEditing(false);
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            >
              {t("common_cancel")}
            </Button>
          )}
          <form.AppForm>
            <form.Subscribe selector={(state) => state.values.kind}>
              {(kind) => (
                <form.SubmitButton>
                  {t(kind === "payment" ? "admin_payment" : "admin_adjustment")}
                </form.SubmitButton>
              )}
            </form.Subscribe>
          </form.AppForm>
        </div>
      </fieldset>
    </form>
  );
}
