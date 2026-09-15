import { configurationSchema, type Configuration, type ConfigDraft } from "@tablecast/api/schema";
import { useForm } from "@tanstack/react-form";
import {
  skipToken,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { ActionFeedback } from "../../components/action-feedback";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { DesignEditor } from "./design-editor";
import { StartConfigurationEditing } from "./configuration-workflow";
import { catalogOptions, configurationImageUploadKey, draftOptions } from "./menu-query";
import { useStore } from "./store-shell";

export function StoreDesign({ draftId }: { draftId?: string }) {
  const store = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const published = useQuery({ ...catalogOptions(store.id), enabled: !draftId });
  const draft = useQuery({
    ...draftOptions(store.id, draftId ?? ""),
    queryFn: draftId ? draftOptions(store.id, draftId).queryFn : skipToken,
  });
  const configuration = draftId ? draft.data?.configuration : published.data?.configuration;
  return (
    <div className="space-y-5">
      <h1>{t("theme_title")}</h1>
      <ErrorNotice error={published.error || draft.error} />
      {!configuration ? (
        published.error || draft.error ? null : (
          <LoadingState />
        )
      ) : draftId && draft.data ? (
        <DesignForm key={`${store.id}:${draftId}`} initial={configuration} draft={draft.data} />
      ) : (
        <>
          <StartConfigurationEditing
            section="products"
            onSelect={(id) =>
              void navigate({
                to: "/admin/stores/$storeId/design",
                params: { storeId: store.id },
                search: { draftId: id },
              })
            }
          />
          <DesignEditor
            organisationLogo={store.logo}
            storeId={store.id}
            value={configuration}
            disabled
            onChange={() => undefined}
            onStagedChange={() => undefined}
          />
        </>
      )}
    </div>
  );
}
function DesignForm({ initial, draft }: { initial: Configuration; draft: ConfigDraft }) {
  const store = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [version, setVersion] = useState(() => draft.version);
  const [issues, setIssues] = useState<string[]>([]);
  const [editorRevision, setEditorRevision] = useState(0);
  const staged = useRef(new Set<string>());
  const [hasStaged, setHasStaged] = useState(false);
  const onStagedChange = useCallback((id: string, next: boolean) => {
    if (next) staged.current.add(id);
    else staged.current.delete(id);
    setHasStaged(staged.current.size > 0);
  }, []);
  const uploads = useIsMutating({ mutationKey: configurationImageUploadKey(store.id) });
  const editable =
    ["draft", "ready"].includes(draft.status) && ["owner", "admin"].includes(store.role);
  const form = useForm({
    defaultValues: { configuration: initial },
    onSubmit: async ({ value }) => {
      if (!staged.current.size && !uploads)
        await save.mutateAsync(value.configuration).catch(() => undefined);
    },
  });
  useBlocker({
    shouldBlockFn: () =>
      Boolean(uploads) ||
      ((form.state.isDirty || staged.current.size > 0) && !window.confirm(t("menu_leave_unsaved"))),
    enableBeforeUnload: () => form.state.isDirty || staged.current.size > 0,
  });
  const save = useMutation({
    mutationFn: async (configuration: Configuration) => {
      const parsed = configurationSchema.safeParse(configuration);
      setIssues(
        parsed.success
          ? []
          : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      );
      if (!parsed.success) throw parsed.error;
      return parseResponse(
        rpc.api.admin.stores[":storeId"].drafts[":id"].$put({
          param: { storeId: store.id, id: draft.id },
          json: {
            expectedVersion: version,
            configuration: parsed.data,
            instructionFormatVersion: 1,
          },
        }),
      );
    },
    onSuccess: (next) => {
      setVersion(next.version);
      form.reset({ configuration: next.configuration });
      client.setQueryData(draftOptions(store.id, draft.id).queryKey, next);
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", store.id] });
      void client.invalidateQueries({ queryKey: ["tablecast-draft-choices", store.id] });
    },
  });
  const preview = useMutation({
    mutationFn: async () => {
      if (form.state.isDirty) await save.mutateAsync(form.state.values.configuration);
      const demo = await parseResponse(
        rpc.api.admin.stores[":storeId"].demo.$post({ param: { storeId: store.id } }),
      );
      await parseResponse(
        rpc.api.admin.stores[":storeId"].demo[":demoId"].$patch({
          param: { storeId: store.id, demoId: demo.id },
          json: { expectedVersion: demo.version, sourceDraftId: draft.id },
        }),
      );
      return demo;
    },
    onSuccess: (demo) =>
      void navigate({
        to: "/admin/stores/$storeId/demo",
        params: { storeId: store.id },
        search: { demoId: demo.id, device: "ipad" },
      }),
  });
  const reload = useMutation({
    mutationFn: () => client.fetchQuery({ ...draftOptions(store.id, draft.id), staleTime: 0 }),
    onSuccess: (next) => {
      setVersion(next.version);
      form.reset({ configuration: next.configuration });
      staged.current.clear();
      setHasStaged(false);
      setIssues([]);
      setEditorRevision((revision) => revision + 1);
      save.reset();
      preview.reset();
    },
  });
  const pending = save.isPending || preview.isPending || reload.isPending;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-5"
    >
      <p>
        {t("theme_draft_hint")} · {draft.id} · v{version}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!editable || pending || hasStaged || !!uploads}>
          {t("common_save")}
        </Button>
        <Button
          variant="outline"
          disabled={!editable || pending || hasStaged || !!uploads}
          onClick={() => preview.mutate()}
        >
          {t("theme_preview")}
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          render={
            <Link
              to="/admin/stores/$storeId/menu/changes/$draftId"
              params={{ storeId: store.id, draftId: draft.id }}
            />
          }
        >
          {t("theme_review")}
        </Button>
      </div>
      {hasStaged && <p role="status">{t("theme_staged_hint")}</p>}
      <ActionFeedback
        pending={pending}
        error={save.error || preview.error || reload.error}
        success={save.isSuccess}
        successMessage={t("account_saved")}
      />
      {editable && apiError(save.error)?.status === 409 && (
        <ConfirmAction
          label={t("workflow_conflict_reload")}
          subject={t("workflow_conflict_reload_note")}
          disabled={pending || !!uploads}
          icon={<Undo2 />}
          onConfirm={() => reload.mutate()}
        />
      )}
      {!!issues.length && (
        <ul role="alert" className="list-inside list-disc text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <form.Subscribe selector={(state) => state.values.configuration}>
        {(configuration) => (
          <DesignEditor
            key={editorRevision}
            organisationLogo={store.logo}
            storeId={store.id}
            value={configuration}
            onChange={(value) => form.setFieldValue("configuration", value)}
            disabled={!editable || pending}
            onStagedChange={onStagedChange}
          />
        )}
      </form.Subscribe>
    </form>
  );
}
