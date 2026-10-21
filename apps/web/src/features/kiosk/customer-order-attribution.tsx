import type { Order } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionFeedback } from "../../components/action-feedback";
import { useAppForm } from "../../components/form";
import { Checkbox } from "../../components/ui/checkbox";
import * as Disclosure from "../../components/ui/disclosure";
import { NativeSelect } from "../../components/ui/native-select";
import { ParticipantIdentity } from "../../components/user-identity";
import { useI18n } from "../../i18n/locale";
import { parseResponse, type TableEndpoint } from "../../lib/api";
export function CustomerOrderAttribution({
  endpoint,
  order,
}: {
  endpoint: TableEndpoint;
  order: Order;
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const participants = useQuery({
    queryKey: ["tablecast-participants", order.tableSessionId, "attribution"],
    queryFn: ({ signal }) =>
      parseResponse(endpoint.client.participants.$get({}, { init: { signal } })),
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: (input: {
      lineId: string;
      participantId: string;
      quantity: number;
      shared: boolean;
    }) =>
      parseResponse(
        endpoint.client["customer-consumption"].$post({
          json: { ...input, orderId: order.id, revision: 0 },
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["tablecast-participants", order.tableSessionId] }),
  });
  const form = useAppForm({
    defaultValues: {
      participantId: "",
      lineId: order.snapshot.lines[0]?.id ?? "",
      quantity: 1,
      shared: false,
    },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  if (!participants.data?.participants.length) return null;
  return (
    <Disclosure.Root className="border-t p-4">
      <Disclosure.Trigger className="cursor-pointer text-sm font-medium">
        {t("customer_record_consumption")}
      </Disclosure.Trigger>
      <Disclosure.Panel>
        <form.AppForm>
          <form.Form className="mt-4 space-y-4">
            <form.Field name="participantId">
              {(field) => (
                <label className="flex flex-col gap-2">
                  {t("customer_target_hint")}
                  <NativeSelect
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    required
                  >
                    <option value="">{t("customer_choose_person")}</option>
                    {participants.data.participants.map((person) => (
                      <option key={person.id} value={person.id}>
                        <ParticipantIdentity name={person.name} />
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
            </form.Field>
            <form.Field name="lineId">
              {(field) => (
                <label className="flex flex-col gap-2">
                  {t("customer_consumption_item")}
                  <NativeSelect
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  >
                    {order.snapshot.lines.map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.name[locale]}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
            </form.Field>
            <form.AppField name="quantity">
              {(field) => (
                <field.NumberField
                  label={t("customer_consumption_quantity")}
                  min={1}
                  max={20}
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

            <form.SubmitButton>{t("account_save")}</form.SubmitButton>

            <ActionFeedback mutation={save} successMessage={t("account_saved")} />
          </form.Form>
        </form.AppForm>
      </Disclosure.Panel>
    </Disclosure.Root>
  );
}
