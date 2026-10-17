import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { pointVisitOptions } from "./point-query";
export function PointVisit({ storeId, sessionId }: { storeId: string; sessionId: string }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const visit = useQuery(pointVisitOptions(storeId, sessionId));
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const confirm = useMutation({
    mutationFn: () =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].points.$post({
          param: { storeId, id: sessionId },
          json: {
            expectedVersion: visit.data?.expectedVersion ?? 0,
            participantIds: selected,
            idempotencyKey: key,
          },
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, sessionId] }),
  });
  const selectedIds = new Set(selected);
  const allocations = new Map(
    visit.data?.allocations.map((allocation) => [allocation.membershipId, allocation]),
  );
  if (visit.isPending) return <LoadingState />;
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <h3 className="font-semibold">{t("customer_points_confirm")}</h3>
      <p className="text-sm text-muted-foreground">{t("customer_points_allocation_note")}</p>
      <ErrorNotice error={visit.error} onRetry={() => void visit.refetch()} />
      {visit.data && (
        <>
          <ul className="space-y-3">
            {visit.data.participants.map((person) => {
              const allocation = allocations.get(person.membershipId);
              return (
                <li key={person.id} className="space-y-2">
                  {visit.data.confirmedAt === null ? (
                    <label className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedIds.has(person.id)}
                        disabled={!hydrated || !person.active || confirm.isPending}
                        onCheckedChange={(checked) => {
                          setSelected((list) =>
                            checked ? [...list, person.id] : list.filter((id) => id !== person.id),
                          );
                          setKey(crypto.randomUUID());
                        }}
                      />
                      {person.name}
                    </label>
                  ) : (
                    <p>
                      {person.name}
                      {allocation ? ` · ¥${allocation.amount} · ${allocation.points} pt` : ""}
                    </p>
                  )}
                  {visit.data.confirmedAt !== null && (
                    <PointCorrection
                      storeId={storeId}
                      membershipId={person.membershipId}
                      sessionId={sessionId}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {visit.data.confirmedAt === null ? (
            <Button disabled={!hydrated || confirm.isPending} onClick={() => confirm.mutate()}>
              {t(selected.length ? "customer_points_award" : "customer_points_confirm_zero")}
            </Button>
          ) : (
            <p className="text-success">{t("customer_points_confirmed")}</p>
          )}
        </>
      )}
      <ActionFeedback
        pending={confirm.isPending}
        error={confirm.error}
        success={false}
        successMessage={t("customer_points_confirmed")}
      />
    </section>
  );
}
function PointCorrection({
  storeId,
  membershipId,
  sessionId,
}: {
  storeId: string;
  membershipId: string;
  sessionId: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: (value: { delta: number; reason: string }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].points.corrections.$post({
          param: { storeId },
          json: { ...value, membershipId, idempotencyKey: key },
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, sessionId] }),
  });
  const form = useAppForm({
    defaultValues: { delta: 0, reason: "" },
    listeners: { onChange: () => setKey(crypto.randomUUID()) },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <details>
      <summary className="cursor-pointer text-sm">{t("customer_points_correct")}</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppField name="delta">
          {(field) => (
            <field.NumberField
              label={t("customer_points_delta")}
              min={-1000000}
              max={1000000}
              required
            />
          )}
        </form.AppField>
        <form.AppField name="reason">
          {(field) => (
            <field.TextField label={t("customer_points_reason")} maxLength={500} required />
          )}
        </form.AppField>
        <form.AppForm>
          <form.SubmitButton>{t("account_save")}</form.SubmitButton>
        </form.AppForm>
        <ActionFeedback
          pending={save.isPending}
          error={save.error}
          success={save.isSuccess}
          successMessage={t("account_saved")}
        />
      </form>
    </details>
  );
}
