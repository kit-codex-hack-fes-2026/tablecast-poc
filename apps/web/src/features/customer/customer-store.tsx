import { CustomerVisits } from "./customer-visits";
import { customerConsentVersion } from "@tablecast/api/schema";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerStoreOptions } from "./customer-query";

const membershipDate = {
  ja: new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo" }),
  en: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo" }),
};

type CustomerStoreData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof customerStoreOptions>["queryFn"]>>
>;

export function CustomerConsent({
  storeId,
  onEnrolled,
}: {
  storeId: string;
  onEnrolled?: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const enrol = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].enrol.$post({
          param: { storeId },
          json: { consentVersion: customerConsentVersion },
        }),
      ),
    onSuccess: async (data) => {
      client.setQueryData(customerStoreOptions(storeId).queryKey, data);
      await client.invalidateQueries({ queryKey: ["tablecast-customer", "memberships"] });
      onEnrolled?.();
    },
  });
  return (
    <section className="space-y-5 rounded-2xl border p-6">
      <h2 className="text-xl font-semibold">{t("customer_consent_title")}</h2>
      <p className="leading-relaxed text-muted-foreground">{t("customer_consent_intro")}</p>
      <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed">
        <li>{t("customer_consent_companions")}</li>
        <li>{t("customer_consent_use")}</li>
        <li>{t("customer_consent_save")}</li>
      </ul>
      <p className="text-sm text-muted-foreground">{t("customer_consent_change")}</p>
      <Button
        className="w-full"
        size="lg"
        disabled={enrol.isPending}
        onClick={() => enrol.mutate()}
      >
        {t("customer_enrol")}
      </Button>
      <ActionFeedback
        pending={enrol.isPending}
        error={enrol.error}
        success={false}
        successMessage={t("account_saved")}
      />
    </section>
  );
}

export function CustomerStore({ storeId }: { storeId: string }) {
  const { data } = useSuspenseQuery(customerStoreOptions(storeId));
  const { t, locale } = useI18n();
  return (
    <div className="space-y-8">
      <section className="space-y-5 rounded-2xl bg-primary p-7 text-primary-foreground">
        <p className="text-sm">{t("customer_card")}</p>
        <h1 className="text-3xl font-semibold">{data.store.name}</h1>
        {data.membership?.active && (
          <p className="text-sm">
            {t("customer_since")} {membershipDate[locale].format(data.membership.joinedAt)}
          </p>
        )}
      </section>
      {data.membership?.active ? (
        <>
          <CustomerVisits storeId={storeId} />
          <CustomerPreferences key={data.membership.revision} data={data} />
        </>
      ) : (
        <CustomerConsent storeId={storeId} />
      )}
    </div>
  );
}

function CustomerPreferences({ data }: { data: CustomerStoreData }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const membership = data.membership;
  const preferences = useMutation({
    mutationFn: (json: {
      revision: number;
      shareCompanions: boolean;
      useMemories: boolean;
      saveMemories: boolean;
    }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].preferences.$post({
          param: { storeId: data.store.id },
          json,
        }),
      ),
    onSuccess: (result) =>
      client.setQueryData(customerStoreOptions(data.store.id).queryKey, result),
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
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">{t("customer_preferences")}</h2>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
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
        <form.AppForm>
          <form.SubmitButton disabled={leave.isPending}>
            {t("customer_save_preferences")}
          </form.SubmitButton>
        </form.AppForm>
        <ActionFeedback
          pending={preferences.isPending}
          error={preferences.error}
          success={preferences.isSuccess}
          successMessage={t("account_saved")}
        />
      </form>
      <div className="space-y-3 border-t pt-6">
        <Button variant="ghost" onClick={() => setConfirmLeave((value) => !value)}>
          {t("customer_leave")}
        </Button>
        {confirmLeave && (
          <div className="space-y-3">
            <p className="text-sm">{t("customer_leave_notice")}</p>
            <Button
              variant="destructive"
              disabled={leave.isPending || preferences.isPending}
              onClick={() => leave.mutate()}
            >
              {t("customer_leave_confirm")}
            </Button>
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
