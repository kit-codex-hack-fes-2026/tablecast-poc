import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerConsumptionOptions } from "./customer-memory-query";
export function CustomerConsumption({ storeId }: { storeId: string }) {
  const { t, locale } = useI18n();
  const records = useSuspenseInfiniteQuery(customerConsumptionOptions(storeId));
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("customer_consumption")}</h1>
      <p className="text-muted-foreground">{t("customer_consumption_note")}</p>
      <ErrorNotice error={records.error} onRetry={() => void records.refetch()} />
      {!records.data.pages[0]?.records.length && <p>{t("common_empty")}</p>}
      {records.data.pages.flatMap((page) =>
        page.records.map((record) => (
          <section
            key={`${record.id}:${record.revision}`}
            className="space-y-3 rounded-xl border p-4"
          >
            <h2 className="font-medium">{record.name?.[locale] ?? record.productId}</h2>
            <p>{t(`order_${record.orderStatus}`)}</p>
            <ConsumptionEditor
              storeId={storeId}
              orderId={record.orderId}
              lineId={record.lineId}
              quantity={record.quantity}
              shared={record.shared}
              revision={record.revision}
            />
          </section>
        )),
      )}
      {records.hasNextPage && (
        <Button
          variant="outline"
          disabled={records.isFetchingNextPage}
          onClick={() => void records.fetchNextPage()}
        >
          {t("customer_more")}
        </Button>
      )}
    </article>
  );
}
export function ConsumptionEditor({
  storeId,
  orderId,
  lineId,
  quantity = 0,
  shared = false,
  revision = 0,
}: {
  storeId: string;
  orderId: string;
  lineId: string;
  quantity?: number;
  shared?: boolean;
  revision?: number;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: (input: { quantity: number; shared: boolean }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].consumption.$post({
          param: { storeId },
          json: { ...input, orderId, lineId, revision },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["tablecast-customer", storeId] });
      setOpen(false);
    },
  });
  const form = useAppForm({
    defaultValues: { quantity: revision ? quantity : 1, shared },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
        {t(revision ? "customer_edit_consumption" : "customer_record_consumption")}
        {revision ? ` · ${quantity}` : ""}
      </Button>
      {open && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="quantity">
            {(field) => (
              <field.NumberField
                label={t("customer_consumption_quantity")}
                min={0}
                max={99}
                required
              />
            )}
          </form.AppField>
          <form.Field name="shared">
            {(field) => (
              <label className="flex items-center gap-3">
                <Checkbox checked={field.state.value} onCheckedChange={field.handleChange} />
                {t("customer_consumption_shared")}
              </label>
            )}
          </form.Field>
          <form.AppForm>
            <form.SubmitButton>{t("account_save")}</form.SubmitButton>
          </form.AppForm>
        </form>
      )}
      <ActionFeedback
        pending={save.isPending}
        error={save.error}
        success={save.isSuccess}
        successMessage={t("account_saved")}
      />
    </div>
  );
}
