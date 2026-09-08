import type { ConfigDraft, Configuration } from "@tablecast/api/schema";
import { catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScroll,
  DialogTitle,
} from "../../components/ui/dialog";
import { useI18n } from "../../i18n/locale";
import { api, json } from "../../lib/api";
import { draftsSchema } from "../../lib/responses";
import { ConfigurationChanges } from "./configuration-changes";
import { ConfigurationEditor } from "./configuration-editor";
import { ConfigurationErrors } from "./configuration-errors";

export function SettingsDrafts({
  storeId,
  initialDraftId,
}: {
  storeId: string;
  initialDraftId?: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const base = `/api/admin/stores/${storeId}/drafts`;
  const [selectedId, setSelectedId] = useState(initialDraftId);
  const drafts = useQuery({
    queryKey: ["tablecast-drafts", storeId],
    queryFn: () => api(base, {}, draftsSchema),
  });
  const selected = useQuery({
    queryKey: ["tablecast-draft", storeId, selectedId],
    queryFn: () => api(`${base}/${selectedId}`, {}, configDraftSchema),
    enabled: !!selectedId,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const create = useMutation({
    mutationFn: () => api(base, json("POST", {}), configDraftSchema),
    onSuccess: (draft) => {
      client.setQueryData(["tablecast-draft", storeId, draft.id], draft);
      setSelectedId(draft.id);
      void drafts.refetch();
    },
  });
  return (
    <section className="border border-border rounded-lg bg-card p-7">
      <h2>{t("admin_drafts")}</h2>
      <Button
        className="my-4"
        variant="outline"
        type="button"
        disabled={create.isPending}
        onClick={() => create.mutate()}
      >
        <Plus size={16} />
        {t("editor_create_draft")}
      </Button>
      <ErrorNotice error={drafts.error || selected.error || create.error} />
      {drafts.data?.drafts
        .filter((draft) => draft.status === "draft" || draft.status === "ready")
        .map((draft) => (
          <div
            key={draft.id}
            className="flex justify-between gap-5 border-t border-t-border py-5 px-0"
            data-draft-id={draft.id}
          >
            <div>
              <strong className="text-base">
                {t("admin_published_version")} {draft.baseVersion} · {t("admin_draft_version")}{" "}
                {draft.version}
              </strong>
              <p className="text-muted-foreground text-sm mt-2">
                {draft.changes.length} {t("admin_change_count")}
              </p>
            </div>
            <Button
              variant="outline"
              type="button"
              disabled={create.isPending}
              onClick={() => setSelectedId(draft.id)}
            >
              {t("admin_review_draft")}
            </Button>
          </div>
        ))}
      {drafts.data?.drafts.every(
        (draft) => draft.status !== "draft" && draft.status !== "ready",
      ) && (
        <p className="py-12 px-6 text-center text-muted-foreground text-sm mt-2.5 mx-0 mb-6">
          {t("admin_no_drafts")}
        </p>
      )}
      {selectedId && selected.data && (
        <DraftDialog
          key={`${storeId}:${selectedId}`}
          initialDraft={selected.data}
          base={base}
          onSaved={(draft) => {
            client.setQueryData(["tablecast-draft", storeId, draft.id], draft);
            void drafts.refetch();
          }}
          onClose={() => setSelectedId((current) => (current === selectedId ? undefined : current))}
        />
      )}
    </section>
  );
}

function DraftDialog({
  initialDraft,
  base,
  onSaved,
  onClose,
}: {
  initialDraft: ConfigDraft;
  base: string;
  onSaved: (draft: ConfigDraft) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const catalog = useQuery({
    queryKey: ["tablecast-admin-catalog", initialDraft.storeId],
    queryFn: ({ signal }) =>
      api(`/api/admin/stores/${initialDraft.storeId}/catalog`, { signal }, catalogSchema),
  });
  const [draft, setDraft] = useState(initialDraft);
  const [configuration, setConfiguration] = useState(initialDraft.configuration);
  const [editorVersion, setEditorVersion] = useState(0);
  const [publishKey] = useState(() => crypto.randomUUID());
  const dirty = JSON.stringify(configuration) !== JSON.stringify(draft.configuration);
  const editable = draft.status === "draft" || draft.status === "ready";
  function saved(next: ConfigDraft) {
    setDraft(next);
    setConfiguration(next.configuration);
    onSaved(next);
  }
  const save = useMutation({
    mutationFn: (next: Configuration) =>
      api(
        `${base}/${draft.id}`,
        json("PUT", { expectedVersion: draft.version, configuration: next }),
        configDraftSchema,
      ),
    onSuccess: saved,
  });
  const validate = useMutation({
    mutationFn: () =>
      api(
        `${base}/${draft.id}/validate`,
        json("POST", { expectedVersion: draft.version }),
        configDraftSchema,
      ),
    onSuccess: saved,
  });
  const publish = useMutation({
    mutationFn: () =>
      api(
        `${base}/${draft.id}/publish`,
        json("POST", {
          expectedVersion: draft.version,
          baseVersion: draft.baseVersion,
          idempotencyKey: publishKey,
          approved: true,
        }),
        configDraftSchema,
      ),
    onSuccess: (published) => {
      onSaved(published);
      onClose();
    },
  });
  const discard = useMutation({
    mutationFn: () =>
      api(
        `${base}/${draft.id}/discard`,
        json("POST", { expectedVersion: draft.version }),
        configDraftSchema,
      ),
    onSuccess: (discarded) => {
      onSaved(discarded);
      onClose();
    },
  });
  const busy = save.isPending || validate.isPending || publish.isPending || discard.isPending;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-192">
        <DialogHeader>
          <DialogClose aria-label={t("common_close")}>
            <X size={22} />
          </DialogClose>
        </DialogHeader>
        <DialogTitle>{t("admin_config")}</DialogTitle>
        <DialogDescription className="sr-only">{t("admin_draft_note")}</DialogDescription>
        <DialogScroll>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(configuration);
            }}
          >
            <ErrorNotice error={catalog.error} onRetry={() => void catalog.refetch()} />
            <ConfigurationEditor
              storeId={draft.storeId}
              key={editorVersion}
              value={configuration}
              onChange={setConfiguration}
              disabled={busy || !editable}
              voices={
                catalog.data
                  ? [catalog.data.configuration.cast.voice, draft.configuration.cast.voice]
                  : [draft.configuration.cast.voice]
              }
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="submit" disabled={!dirty || busy || !editable}>
                {t("common_save")}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={!dirty || busy || !editable}
                onClick={() => {
                  setConfiguration(draft.configuration);
                  setEditorVersion((version) => version + 1);
                }}
              >
                {t("common_cancel")}
              </Button>
            </div>
          </form>
          {dirty && (
            <output className="flex items-start gap-2.5 py-3 px-3.5 rounded-md bg-accent-soft text-base leading-relaxed [&_svg]:shrink-0 [&_svg]:mt-0.5 [&_[data-slot=button][data-size=text]]:min-h-6 [&_[data-slot=button][data-size=text]]:ml-auto [&_[data-slot=button][data-size=text]]:shrink-0">
              {t("admin_unsaved")}
            </output>
          )}
          <ConfigurationErrors errors={draft.errors} configuration={draft.configuration} />
          <h3 className="mt-6 font-semibold">{t("admin_saved_changes")}</h3>
          {draft.changes.some((change) => change.sensitive) && (
            <div className="flex items-start gap-2.5 py-3 px-3.5 rounded-md bg-accent-soft text-base leading-relaxed [&_svg]:shrink-0 [&_svg]:mt-0.5 [&_[data-slot=button][data-size=text]]:min-h-6 [&_[data-slot=button][data-size=text]]:ml-auto [&_[data-slot=button][data-size=text]]:shrink-0">
              {t("admin_sensitive")}
            </div>
          )}
          <ConfigurationChanges changes={draft.changes} configuration={draft.configuration} />
        </DialogScroll>
        <ErrorNotice error={save.error || validate.error || publish.error || discard.error} />
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            disabled={!editable || busy}
            onClick={() => discard.mutate()}
          >
            {t("editor_discard_draft")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            type="button"

            disabled={!editable || dirty || busy}
            onClick={() => validate.mutate()}
          >
            {t("admin_validate")}
          </Button>
          <Button
            variant="default"
            size="lg"
            type="button"

            disabled={draft.status !== "ready" || draft.errors.length > 0 || dirty || busy}
            onClick={() => publish.mutate()}
          >
            {t("admin_publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
