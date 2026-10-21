import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Pencil, UtensilsCrossed } from "lucide-react";
import { useId, useRef, useState } from "react";
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
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("customer_consumption")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("customer_consumption_note")}
        </p>
      </header>
      <ErrorNotice query={records} />
      {!records.data.pages[0]?.records.length && <p>{t("common_empty")}</p>}
      {records.data.pages.flatMap((page) =>
        page.records.map((record) => (
          <section
            key={`${record.id}:${record.revision}`}
            className="space-y-3 rounded-xl bg-card p-5"
          >
            <h2 className="font-medium wrap-anywhere">
              {record.name?.[locale] ?? t("object_unknown_product")}
            </h2>
            <p className="text-sm text-muted-foreground">{t(`order_${record.orderStatus}`)}</p>
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
  lineId: string;
  orderId: string;
  quantity?: number;
  revision?: number;
  shared?: boolean;
  storeId: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const editorId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
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
      <Button
        ref={trigger}
        size="sm"
        variant="outline"
        aria-expanded={open}
        aria-controls={open ? editorId : undefined}
        disabled={open || save.isPending}
        onClick={() => setOpen(true)}
      >
        {revision ? <Pencil aria-hidden="true" /> : <UtensilsCrossed aria-hidden="true" />}
        {t(revision ? "customer_edit_consumption" : "customer_record_consumption")}
        {revision ? ` · ${quantity}` : ""}
      </Button>
      {open && (
        <form.AppForm>
          <form.Form
            id={editorId}
            className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4"
          >
            <form.AppField name="quantity">
              {(field) => (
                <field.NumberField
                  disabled={save.isPending}
                  label={t("customer_consumption_quantity")}
                  min={0}
                  max={99}
                  required
                />
              )}
            </form.AppField>
            <form.Field name="shared">
              {(field) => (
                <label className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    disabled={save.isPending}
                    checked={field.state.value}
                    onCheckedChange={field.handleChange}
                  />
                  {t("customer_consumption_shared")}
                </label>
              )}
            </form.Field>
            <div className="flex flex-wrap gap-3">
              <form.SubmitButton>{t("account_save")}</form.SubmitButton>

              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => {
                  form.reset();
                  save.reset();
                  setOpen(false);
                  requestAnimationFrame(() => trigger.current?.focus());
                }}
              >
                {t("common_cancel")}
              </Button>
            </div>
          </form.Form>
        </form.AppForm>
      )}
      {!save.isIdle && <ActionFeedback mutation={save} successMessage={t("account_saved")} />}
    </div>
  );
}
