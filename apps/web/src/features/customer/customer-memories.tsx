import { calendarDate } from "../../i18n/format";
import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Brain, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmAction } from "../../components/confirm-action";
import { customerMemoryInputSchema } from "@tablecast/api/schema";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerMemoriesOptions } from "./customer-memory-query";
type Memory = Awaited<
  ReturnType<NonNullable<ReturnType<typeof customerMemoriesOptions>["queryFn"]>>
>["memories"][number];
export function CustomerMemories({ storeId }: { storeId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const records = useSuspenseInfiniteQuery(customerMemoriesOptions(storeId));
  const [editing, setEditing] = useState<Memory | null>();
  const editOrigin = useRef<HTMLButtonElement | null>(null);
  const remove = useMutation({
    mutationFn: (memory: Memory) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].memories[":memoryId"].delete.$post({
          param: { storeId, memoryId: memory.id },
          json: { revision: memory.revision },
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["tablecast-customer", storeId, "memories"] }),
  });
  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <Brain aria-hidden="true" className="size-6 shrink-0" />
          {t("customer_memories")}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("customer_memories_note")}
        </p>
      </header>
      <Button
        disabled={editing !== undefined || remove.isPending}
        onClick={(event) => {
          editOrigin.current = event.currentTarget;
          setEditing(null);
        }}
      >
        <Plus aria-hidden="true" />
        {t("customer_memory_add")}
      </Button>
      {editing !== undefined && (
        <MemoryEditor
          key={editing?.id ?? "new"}
          storeId={storeId}
          memory={editing}
          onClose={() => {
            setEditing(undefined);
            requestAnimationFrame(() => editOrigin.current?.focus());
          }}
        />
      )}
      <ErrorNotice error={records.error} onRetry={() => void records.refetch()} />
      <ul className="space-y-4">
        {records.data.pages.flatMap((page) =>
          page.memories.map((memory) => (
            <li key={memory.id} className="space-y-3 rounded-xl border border-border bg-card p-5">
              <p className="whitespace-pre-wrap wrap-anywhere">{memory.content}</p>
              <p className="text-sm text-muted-foreground">
                {t(
                  memory.sourceKind === "voice"
                    ? "customer_memory_voice"
                    : "customer_memory_manual",
                )}{" "}
                · {calendarDate(memory.createdAt, locale)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={editing !== undefined || remove.isPending}
                  onClick={(event) => {
                    editOrigin.current = event.currentTarget;
                    setEditing(memory);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  {t("customer_edit")}
                </Button>
                <ConfirmAction
                  label={t("customer_delete")}
                  subject={`${memory.content}\n\n${t("customer_memory_delete_notice")}`}
                  disabled={remove.isPending || editing !== undefined}
                  icon={<Trash2 aria-hidden="true" />}
                  onConfirm={() => remove.mutate(memory)}
                />
              </div>
            </li>
          )),
        )}
      </ul>
      {!records.data.pages[0]?.memories.length && <p>{t("common_empty")}</p>}
      {!remove.isIdle && (
        <ActionFeedback
          pending={remove.isPending}
          error={remove.error}
          success={remove.isSuccess}
          successMessage={t("account_saved")}
        />
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
function MemoryEditor({
  storeId,
  memory,
  onClose,
}: {
  storeId: string;
  memory: Memory | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [id] = useState(() => memory?.id ?? crypto.randomUUID());
  const save = useMutation({
    mutationFn: (content: string) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].memories.$post({
          param: { storeId },
          json: { id, revision: memory?.revision ?? 0, content },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["tablecast-customer", storeId, "memories"] });
      onClose();
    },
  });
  const form = useAppForm({
    defaultValues: { content: memory?.content ?? "" },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value.content).catch(() => undefined);
    },
  });
  return (
    <form
      className="space-y-4 rounded-xl bg-secondary/60 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField
        name="content"
        validators={{ onChange: customerMemoryInputSchema.shape.content }}
      >
        {(field) => (
          <field.TextField
            label={t("customer_memory_content")}
            required
            maxLength={1000}
            disabled={save.isPending}
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-3">
        <form.AppForm>
          <form.SubmitButton>{t("account_save")}</form.SubmitButton>
        </form.AppForm>
        <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
          {t("common_cancel")}
        </Button>
      </div>
      <ActionFeedback
        pending={save.isPending}
        error={save.error}
        success={false}
        successMessage={t("account_saved")}
      />
    </form>
  );
}
