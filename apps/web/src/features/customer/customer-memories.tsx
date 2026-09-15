import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { customerMemoryInputSchema } from "@tablecast/api/schema";
import { ActionFeedback } from "../../components/action-feedback";
import { ErrorNotice } from "../../components/error-notice";
import { useAppForm } from "../../components/form";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { customerMemoriesOptions } from "./customer-memory-query";
const memoryDates = {
  ja: new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }),
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Tokyo" }),
};
type Memory = Awaited<
  ReturnType<NonNullable<ReturnType<typeof customerMemoriesOptions>["queryFn"]>>
>["memories"][number];
export function CustomerMemories({ storeId }: { storeId: string }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const records = useSuspenseInfiniteQuery(customerMemoriesOptions(storeId));
  const [editing, setEditing] = useState<Memory | null>();
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
      <h1 className="text-2xl font-semibold">{t("customer_memories")}</h1>
      <p className="text-muted-foreground">{t("customer_memories_note")}</p>
      <Button onClick={() => setEditing(null)}>{t("customer_memory_add")}</Button>
      {editing !== undefined && (
        <MemoryEditor
          key={editing?.id ?? "new"}
          storeId={storeId}
          memory={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      <ErrorNotice error={records.error} onRetry={() => void records.refetch()} />
      <ul className="space-y-4">
        {records.data.pages.flatMap((page) =>
          page.memories.map((memory) => (
            <li key={memory.id} className="space-y-3 rounded-xl border p-4">
              <p className="whitespace-pre-wrap">{memory.content}</p>
              <p className="text-sm text-muted-foreground">
                {t(
                  memory.sourceKind === "voice"
                    ? "customer_memory_voice"
                    : "customer_memory_manual",
                )}{" "}
                · {memoryDates[locale].format(memory.createdAt)}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(memory)}>
                  {t("customer_edit")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(memory)}
                >
                  {t("customer_delete")}
                </Button>
              </div>
            </li>
          )),
        )}
      </ul>
      {!records.data.pages[0]?.memories.length && <p>{t("common_empty")}</p>}
      <ActionFeedback
        pending={remove.isPending}
        error={remove.error}
        success={remove.isSuccess}
        successMessage={t("account_saved")}
      />
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
      className="space-y-4 rounded-xl border p-4"
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
          <field.TextField label={t("customer_memory_content")} required maxLength={1000} />
        )}
      </form.AppField>
      <div className="flex gap-3">
        <form.AppForm>
          <form.SubmitButton>{t("account_save")}</form.SubmitButton>
        </form.AppForm>
        <Button variant="ghost" onClick={onClose}>
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
