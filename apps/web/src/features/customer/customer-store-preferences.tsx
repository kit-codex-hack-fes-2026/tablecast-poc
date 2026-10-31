import type { customerPreferencesSchema } from "@tablecast/api/schema";
import type { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { useI18n } from "../../i18n/locale";
import { type InferResponseType, parseResponse, rpc } from "../../lib/api";
import { customerStoreOptions } from "./customer-query";

type CustomerStoreData = InferResponseType<
  (typeof rpc.api.customer.stores)[":storeId"]["$get"],
  200
>;

export function CustomerPreferences({ data }: { data: CustomerStoreData }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveTrigger = useRef<HTMLButtonElement>(null);
  const membership = data.membership;
  const preferences = useMutation({
    mutationFn: (json: z.input<typeof customerPreferencesSchema>) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].preferences.$post({
          param: { storeId: data.store.id },
          json,
        }),
      ),
    onSuccess: (result) => {
      client.setQueryData(customerStoreOptions(data.store.id).queryKey, result);
      if (result.membership)
        form.reset({
          shareCompanions: result.membership.shareCompanions,
          useMemories: result.membership.useMemories,
          saveMemories: result.membership.saveMemories,
        });
    },
  });
  const leave = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].leave.$post({
          param: { storeId: data.store.id },
          json: { revision: membership?.revision ?? 0 },
        }),
      ),
    onSuccess: async () => {
      client.removeQueries({ queryKey: ["tablecast-customer", data.store.id] });
      await client.invalidateQueries({ queryKey: ["tablecast-customer", "memberships"] });
      await navigate({ to: "/member" });
    },
  });
  const form = useAppForm({
    defaultValues: {
      shareCompanions: membership?.shareCompanions ?? false,
      useMemories: membership?.useMemories ?? false,
      saveMemories: membership?.saveMemories ?? false,
    },
    onSubmit: async ({ value }) => {
      await preferences
        .mutateAsync({ ...value, revision: membership?.revision ?? 0 })
        .catch(() => undefined);
    },
  });
  return (
    <section className="space-y-6 pt-4">
      <form.AppForm>
        <form.Form className="space-y-4">
          {(["shareCompanions", "useMemories", "saveMemories"] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <label className="flex min-h-12 items-center gap-3">
                  <Checkbox
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                    disabled={preferences.isPending || leave.isPending}
                  />
                  {t(
                    name === "shareCompanions"
                      ? "customer_share_companions"
                      : name === "useMemories"
                        ? "customer_use_memories"
                        : "customer_save_memories",
                  )}
                </label>
              )}
            </form.Field>
          ))}

          <form.SubmitButton disabled={leave.isPending}>
            {t("customer_save_preferences")}
          </form.SubmitButton>

          <ActionFeedback mutation={preferences} successMessage={t("account_saved")} />
        </form.Form>
      </form.AppForm>
      <div className="space-y-3 border-t border-border pt-6">
        <Button
          ref={leaveTrigger}
          variant="outline"
          aria-expanded={confirmLeave}
          disabled={leave.isPending || preferences.isPending || confirmLeave}
          onClick={() => setConfirmLeave(true)}
        >
          {t("customer_leave")}
        </Button>
        {confirmLeave && (
          <div className="space-y-3 rounded-xl border border-destructive-border bg-destructive-soft p-4">
            <p className="text-sm">{t("customer_leave_notice")}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={leave.isPending}
                onClick={() => {
                  setConfirmLeave(false);
                  requestAnimationFrame(() => leaveTrigger.current?.focus());
                }}
              >
                {t("customer_cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={leave.isPending || preferences.isPending}
                onClick={() => leave.mutate()}
              >
                {t("customer_leave_confirm")}
              </Button>
            </div>
          </div>
        )}
        <ActionFeedback
          pending={leave.isPending}
          error={leave.error}
          success={false}
          successMessage={t("account_saved")}
        />
      </div>
    </section>
  );
}
