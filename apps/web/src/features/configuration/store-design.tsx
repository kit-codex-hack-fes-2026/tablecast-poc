import { type ConfigDraft, type Configuration, configurationSchema } from "@tablecast/api/schema";
import { useForm } from "@tanstack/react-form";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  skipToken,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { catalogOptions } from "../catalog/catalog-query";
import { useStore } from "../store/store-context";
import { SaveStatus } from "./configuration-status";
import { ConfigurationToolbar } from "./configuration-toolbar";
import { StartConfigurationEditing } from "./configuration-workflow";
import { DesignEditor } from "./design-editor";
import { designValidationIssues } from "./design-validation";
import { configurationImageUploadKey, draftOptions } from "./menu-query";
import { StoreDesignOverview } from "./store-design-overview";

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
      <PageHeader
        title={t("theme_title")}
        actions={
          !draftId &&
          configuration &&
          ["owner", "admin"].includes(store.role) && (
            <StartConfigurationEditing
              section="products"
              onSelect={(id) =>
                void navigate({
                  to: "/admin/stores/$storeId/design",
                  params: { storeId: store.id },
                  search: (previous) => ({ ...previous, draftId: id }),
                })
              }
            />
          )
        }
      />
      <ErrorNotice error={published.error || draft.error} />
      {!configuration ? (
        published.error || draft.error ? null : (
          <LoadingState />
        )
      ) : draftId && draft.data ? (
        <DesignForm key={`${store.id}:${draftId}`} initial={configuration} draft={draft.data} />
      ) : (
        published.data && <StoreDesignOverview catalog={published.data} />
      )}
    </div>
  );
}
function designValues({ branding, appearance, banners }: Configuration) {
  return { branding, appearance, banners };
}
function DesignForm({ initial, draft }: { draft: ConfigDraft; initial: Configuration }) {
  const store = useStore();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [version, setVersion] = useState(() => draft.version);
  const [issues, setIssues] = useState<string[]>([]);
  const issueSummary = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!issues.length) return;
    const summary = issueSummary.current;
    summary?.focus();
  }, [issues]);
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
    defaultValues: designValues(initial),
    onSubmit: async ({ value }) => {
      if (!staged.current.size && !uploads)
        await save.mutateAsync({ ...initial, ...value }).catch(() => undefined);
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
      setIssues(parsed.success ? [] : designValidationIssues(parsed.error.issues, locale, t));
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
      form.reset(designValues(next.configuration));
      client.setQueryData(draftOptions(store.id, draft.id).queryKey, next);
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", store.id] });
      void client.invalidateQueries({ queryKey: ["tablecast-draft-choices", store.id] });
    },
  });
  const preview = useMutation({
    mutationFn: async () => {
      if (form.state.isDirty) await save.mutateAsync({ ...initial, ...form.state.values });
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
      form.reset(designValues(next.configuration));
      staged.current.clear();
      setHasStaged(false);
      setIssues([]);
      setEditorRevision((revision) => revision + 1);
      save.reset();
      preview.reset();
    },
  });
  const pending = save.isPending || preview.isPending || reload.isPending;
  const blocked = !editable || pending || hasStaged || !!uploads;
  useHotkey(
    "Mod+S",
    () => {
      if (!blocked) void form.handleSubmit();
    },
    { enabled: editable, ignoreInputs: false },
  );
  return (
    <form
      id="tablecast-design-editor"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-5"
    >
      <ConfigurationToolbar slot="status">
        <form.Subscribe selector={(state) => state.isDirty}>
          {(dirty) => (
            <SaveStatus
              dirty={dirty || hasStaged}
              pending={pending}
              error={save.error || preview.error || reload.error}
            />
          )}
        </form.Subscribe>
      </ConfigurationToolbar>
      <ConfigurationToolbar>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            form="tablecast-design-editor"
            disabled={blocked}
            aria-keyshortcuts="Control+s Meta+s"
          >
            {t("common_save")}
          </Button>
          <Button variant="outline" disabled={blocked} onClick={() => preview.mutate()}>
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
      </ConfigurationToolbar>
      <ActionFeedback
        pending={pending}
        error={issues.length ? undefined : save.error || preview.error || reload.error}
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
        <ul
          ref={issueSummary}
          tabIndex={-1}
          role="alert"
          className="list-inside list-disc rounded-lg bg-destructive/10 p-4 text-sm text-destructive outline-none"
        >
          {issues.map((issue, index) => (
            <li key={`${index}:${issue}`}>{issue}</li>
          ))}
        </ul>
      )}
      <form.Subscribe selector={(state) => state.values}>
        {(configuration) => (
          <DesignEditor
            key={editorRevision}
            organisationLogo={store.logo}
            storeId={store.id}
            value={{ ...initial, ...configuration }}
            onChange={(value) => {
              form.setFieldValue("branding", value.branding);
              form.setFieldValue("appearance", value.appearance);
              form.setFieldValue("banners", value.banners);
            }}
            disabled={!editable || pending}
            onStagedChange={onStagedChange}
          />
        )}
      </form.Subscribe>
    </form>
  );
}
