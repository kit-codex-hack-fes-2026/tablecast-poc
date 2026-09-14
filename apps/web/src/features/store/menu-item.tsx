import type { ConfigDraft, Configuration } from "@tablecast/api/schema";
import { useForm } from "@tanstack/react-form";
import {
  skipToken,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useBlocker, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Save, Trash2, Undo2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ConfigurationStatus } from "../shell/configuration-status";
import { apiError } from "../../lib/api-error";
import { ConfirmAction } from "../../components/confirm-action";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { MenuOverview } from "./menu-overview";

import { parseResponse, rpc } from "../../lib/api";
import { CastEditor, CategoriesEditor, PlansEditor, ProductsEditor } from "./configuration-editor";
import type { ImageStagedChange } from "./configuration-image-field";
import {
  emptyMenuListSearch,
  castTargets,
  addMenuItem,
  menuLabels,
  type MenuListSearch,
  type MenuSection,
} from "./menu-model";
import { catalogOptions, configurationImageUploadKey, draftOptions } from "./menu-query";
import { useStore } from "./store-shell";

export function MenuItem({
  section,
  itemId,
  draftId,
  search = emptyMenuListSearch,
}: {
  section: MenuSection;
  itemId: string;
  draftId?: string;
  search?: MenuListSearch;
}) {
  const store = useStore();
  const catalog = useQuery({ ...catalogOptions(store.id), enabled: !draftId });
  const draft = useQuery({
    ...draftOptions(store.id, draftId ?? ""),
    queryFn: draftId ? draftOptions(store.id, draftId).queryFn : skipToken,
  });
  const configuration = draftId ? draft.data?.configuration : catalog.data?.configuration;
  return (
    <>
      <ErrorNotice error={catalog.error || draft.error} />
      {configuration ? (
        draftId && draft.data ? (
          <ItemForm
            key={`${store.id}:${draftId}:${section}:${itemId}`}
            search={search}
            section={section}
            itemId={itemId}
            initialConfiguration={configuration}
            draft={draft.data}
          />
        ) : (
          <MenuOverview
            search={search}
            configuration={configuration}
            section={section}
            itemId={itemId}
          />
        )
      ) : (
        !(catalog.error || draft.error) && <LoadingState />
      )}
    </>
  );
}
function ItemForm({
  section,
  itemId,
  initialConfiguration,
  draft,
  search,
}: {
  section: MenuSection;
  itemId: string;
  initialConfiguration: Configuration;
  draft: ConfigDraft;
  search: MenuListSearch;
}) {
  const store = useStore();
  const storeId = store.id;
  const { locale, t } = useI18n();
  const client = useQueryClient();
  const images = useImageEdits(storeId);
  const navigate = useNavigate();
  const [newId] = useState(() => crypto.randomUUID());
  const selectedId = itemId === "new" ? newId : itemId;
  const editable =
    (draft.status === "draft" || draft.status === "ready") &&
    (store.role === "owner" || store.role === "admin");
  const catalog = useQuery(catalogOptions(storeId));
  const newSaved = useRef(false);
  const [version, setVersion] = useState(() => draft.version);
  const [initial, setInitial] = useState(() =>
    itemId === "new"
      ? addMenuItem(initialConfiguration, section, selectedId)
      : initialConfiguration,
  );
  const form = useForm({
    defaultValues: { configuration: initial },
    onSubmit: async ({ value }) => {
      if (images.uploadingNow() || reload.isPending) return;
      await save.mutateAsync(value.configuration).catch(() => undefined);
    },
  });
  const hasUnsavedChanges = () =>
    editable &&
    (form.state.isDirty ||
      images.staged.current.size > 0 ||
      (itemId === "new" && !newSaved.current));
  useBlocker({
    shouldBlockFn: () =>
      images.uploadingNow() || (hasUnsavedChanges() && !window.confirm(t("menu_leave_unsaved"))),
    enableBeforeUnload: () => images.uploadingNow() || hasUnsavedChanges(),
  });
  const save = useMutation({
    mutationFn: (configuration: Configuration) => {
      return parseResponse(
        rpc.api.admin.stores[":storeId"].drafts[":id"].$put({
          param: { storeId, id: draft.id },
          json: { expectedVersion: version, configuration },
        }),
      );
    },
    onSuccess: (next) => {
      newSaved.current = true;
      setVersion(next.version);
      setInitial(next.configuration);
      form.reset({ configuration: next.configuration });
      client.setQueryData(draftOptions(storeId, next.id).queryKey, next);
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
      void client.invalidateQueries({ queryKey: ["tablecast-draft-choices", storeId] });
      if (itemId === "new")
        void navigate({
          to: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
          params: { storeId, draftId: next.id, section, itemId: selectedId },
          replace: true,
          search,
        });
    },
  });
  const reload = useMutation({
    mutationFn: () => client.fetchQuery({ ...draftOptions(storeId, draft.id), staleTime: 0 }),
    onSuccess: (next) => {
      setVersion(next.version);
      setInitial(next.configuration);
      form.reset({ configuration: next.configuration });
      client.setQueryData(draftOptions(storeId, next.id).queryKey, next);
      images.reset();
      save.reset();
    },
  });
  const pending = save.isPending || reload.isPending;
  const remove = useMutation({
    mutationFn: async () => {
      const configuration = form.state.values.configuration;
      if (section === "cast") return;
      await save.mutateAsync({
        ...configuration,
        [section]: configuration[section].filter((item) => item.id !== selectedId),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tablecast-drafts", storeId] });
      void navigate({
        to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
        params: { storeId, draftId: draft.id, section },
        search,
      });
    },
  });
  const item =
    section === "cast" ? null : initial[section].find((value) => value.id === selectedId);
  return (
    <section className="space-y-6">
      <Button
        nativeButton={false}
        role="link"
        variant="ghost"
        render={
          <Link
            to="/admin/stores/$storeId/menu/changes/$draftId/$section"
            params={{ storeId, draftId: draft.id, section }}
            search={search}
          />
        }
      >
        <ArrowLeft />
        {t(menuLabels[section])}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {itemId === "new"
            ? t("common_add")
            : (item?.text[locale].displayName ?? t(menuLabels[section]))}
        </h1>
      </div>
      <form.Subscribe selector={(state) => state.isDirty}>
        {(dirty) =>
          catalog.data && (
            <ConfigurationStatus
              storeName={store.name}
              publishedVersion={catalog.data.version}
              draft={
                draft
                  ? { id: draft.id, status: draft.status, baseVersion: draft.baseVersion, version }
                  : undefined
              }
              dirty={dirty || images.hasStaged || (itemId === "new" && !newSaved.current)}
              pending={save.isPending}
              error={save.error || reload.error}
            />
          )
        }
      </form.Subscribe>
      {catalog.data && editable && catalog.data.version !== draft.baseVersion && (
        <p className="text-destructive">{t("workflow_stale")}</p>
      )}
      {!editable && <p className="text-muted-foreground">{t("workflow_terminal_note")}</p>}
      {section !== "cast" && !item ? (
        <p>{t("menu_item_missing")}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          className="max-w-4xl space-y-6"
        >
          <form.Subscribe selector={(state) => state.values.configuration}>
            {(configuration) => (
              <fieldset
                disabled={!editable || pending}
                className="min-w-0 space-y-8 [&_input:disabled]:opacity-100 [&_textarea:disabled]:opacity-100 [&_select:disabled]:opacity-100"
              >
                <ItemFields
                  key={section === "cast" ? "cast" : images.fieldKey}
                  onImageStagedChange={images.onStagedChange}
                  section={section}
                  storeId={storeId}
                  value={configuration}
                  selectedId={selectedId}
                  retainedVoice={initial.cast.voice}
                  onChange={(next) => form.setFieldValue("configuration", next)}
                  disabled={!editable}
                />
              </fieldset>
            )}
          </form.Subscribe>
          {editable && (
            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-white py-4">
              <form.Subscribe selector={(state) => state.isDirty}>
                {(dirty) => (
                  <ItemSaveAction
                    dirty={dirty}
                    pending={pending}
                    uploadingImages={images.uploading}
                    stagedImages={images.hasStaged}
                    newUnsaved={itemId === "new" && !newSaved.current}
                    isNew={itemId === "new"}
                  />
                )}
              </form.Subscribe>
              {itemId !== "new" && section !== "cast" && (
                <ConfirmAction
                  label={t("menu_remove_item")}
                  subject={t("menu_remove_note")}
                  disabled={remove.isPending || pending || images.uploading}
                  onConfirm={() => {
                    if (!images.uploadingNow()) remove.mutate();
                  }}
                  icon={<Trash2 />}
                />
              )}
              <form.Subscribe selector={(state) => state.isDirty}>
                {(dirty) => (
                  <>
                    {(dirty || images.hasStaged) && (
                      <ConfirmAction
                        label={t("workflow_revert")}
                        subject={t("workflow_revert_note")}
                        disabled={pending || images.uploading}
                        onConfirm={() => {
                          if (images.uploadingNow()) return;
                          form.reset({ configuration: initial });
                          images.reset();
                          save.reset();
                        }}
                        icon={<Undo2 />}
                      />
                    )}
                    <Button
                      nativeButton={false}
                      role="link"
                      variant="outline"
                      disabled={
                        dirty ||
                        pending ||
                        images.uploading ||
                        images.hasStaged ||
                        (itemId === "new" && !newSaved.current)
                      }
                      render={
                        <Link
                          to="/admin/stores/$storeId/menu/changes/$draftId"
                          params={{ storeId, draftId: draft.id }}
                          search={{ ...search, returnSection: section }}
                          onClick={(event) => {
                            if (images.uploadingNow() || images.staged.current.size > 0)
                              event.preventDefault();
                          }}
                        />
                      }
                    >
                      {t("workflow_review")}
                    </Button>
                  </>
                )}
              </form.Subscribe>
            </div>
          )}
        </form>
      )}
      <ActionFeedback
        pending={save.isPending}
        error={save.error || remove.error || reload.error}
        success={save.isSuccess}
        successMessage={t("account_saved")}
      />
      {editable && apiError(save.error)?.status === 409 && (
        <ConfirmAction
          label={t("workflow_conflict_reload")}
          subject={t("workflow_conflict_reload_note")}
          disabled={pending || images.uploading}
          onConfirm={() => {
            if (!images.uploadingNow() && !save.isPending) reload.mutate();
          }}
          icon={<Undo2 />}
        />
      )}
      {editable && <p className="text-sm text-muted-foreground">{t("workflow_save_first")}</p>}
    </section>
  );
}

function ItemFields({
  section,
  retainedVoice,
  ...props
}: {
  section: MenuSection;
  retainedVoice: Configuration["cast"]["voice"];
  onImageStagedChange?: ImageStagedChange;
  storeId: string;
  value: Configuration;
  selectedId: string;
  disabled: boolean;
  onChange: (configuration: Configuration) => void;
}) {
  const hash = useLocation({ select: (location) => location.hash });
  if (section === "cast")
    return (
      <CastEditor
        focusTarget={castTargets.find((target) => target === hash)}
        storeId={props.storeId}
        value={props.value.cast}
        voices={[retainedVoice]}
        onChange={(cast) => props.onChange({ ...props.value, cast })}
        disabled={props.disabled}
      />
    );
  const Editor =
    section === "products"
      ? ProductsEditor
      : section === "categories"
        ? CategoriesEditor
        : PlansEditor;
  return <Editor {...props} />;
}

function useImageEdits(storeId: string) {
  const client = useQueryClient();
  const uploading = useIsMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0;
  const staged = useRef(new Set<string>());
  const [hasStaged, setHasStaged] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);
  const onStagedChange = useCallback((id: string, isStaged: boolean) => {
    if (isStaged) staged.current.add(id);
    else staged.current.delete(id);
    setHasStaged(staged.current.size > 0);
  }, []);
  return {
    uploading,
    uploadingNow: () =>
      client.isMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0,
    staged,
    hasStaged,
    onStagedChange,
    fieldKey,
    reset: () => {
      staged.current.clear();
      setHasStaged(false);
      setFieldKey((key) => key + 1);
    },
  };
}

function ItemSaveAction({
  dirty,
  pending,
  uploadingImages,
  stagedImages,
  newUnsaved,
  isNew,
}: {
  dirty: boolean;
  pending: boolean;
  uploadingImages: boolean;
  stagedImages: boolean;
  newUnsaved: boolean;
  isNew: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <Button
        type="submit"
        data-pwa-blocked={dirty || pending || uploadingImages || stagedImages || newUnsaved}
        disabled={pending || uploadingImages || (!dirty && !isNew)}
      >
        <Save />
        {t("common_save")}
      </Button>
      {(dirty || uploadingImages || stagedImages) && (
        <span role="status" className="text-sm text-muted-foreground">
          {t(
            uploadingImages
              ? "editor_image_wait"
              : stagedImages
                ? "editor_image_staged"
                : "admin_unsaved",
          )}
        </span>
      )}
    </div>
  );
}
