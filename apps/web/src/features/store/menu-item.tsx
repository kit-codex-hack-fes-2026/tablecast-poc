import type { ConfigDraft, Configuration } from "@tablecast/api/schema";
import { useForm } from "@tanstack/react-form";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Save, Trash2, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
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
import { addMenuItem, menuLabels, type MenuSection } from "./menu-model";
import { catalogOptions, draftOptions } from "./menu-query";
import { useStore } from "./store-shell";

export function MenuItem({
  section,
  itemId,
  draftId,
}: {
  section: MenuSection;
  itemId: string;
  draftId?: string;
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
            key={`${store.id}:${draftId ?? "published"}:${section}:${itemId}`}
            section={section}
            itemId={itemId}
            initialConfiguration={configuration}
            draft={draft.data}
          />
        ) : (
          <MenuOverview configuration={configuration} section={section} itemId={itemId} />
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
}: {
  section: MenuSection;
  itemId: string;
  initialConfiguration: Configuration;
  draft?: ConfigDraft;
}) {
  const store = useStore();
  const storeId = store.id;
  const { locale, t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [newId] = useState(() => crypto.randomUUID());
  const selectedId = itemId === "new" ? newId : itemId;
  const editable =
    !!draft &&
    (draft.status === "draft" || draft.status === "ready") &&
    (store.role === "owner" || store.role === "admin");
  const catalog = useQuery(catalogOptions(storeId));
  const newSaved = useRef(false);
  const [version, setVersion] = useState(draft?.version ?? 0);
  const [initial, setInitial] = useState(() =>
    itemId === "new"
      ? addMenuItem(initialConfiguration, section, selectedId)
      : initialConfiguration,
  );
  const form = useForm({
    defaultValues: { configuration: initial },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value.configuration).catch(() => undefined);
    },
  });
  useBlocker({
    shouldBlockFn: () =>
      editable &&
      (form.state.isDirty || (itemId === "new" && !newSaved.current)) &&
      !window.confirm(t("menu_leave_unsaved")),
    enableBeforeUnload: () =>
      editable && (form.state.isDirty || (itemId === "new" && !newSaved.current)),
  });
  const save = useMutation({
    mutationFn: (configuration: Configuration) => {
      if (!draft) throw new Error("DRAFT_REQUIRED");
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
          search: true,
        });
    },
  });
  const reload = useMutation({
    mutationFn: () =>
      client.fetchQuery({ ...draftOptions(storeId, draft?.id ?? ""), staleTime: 0 }),
    onSuccess: (next) => {
      setVersion(next.version);
      setInitial(next.configuration);
      form.reset({ configuration: next.configuration });
      client.setQueryData(draftOptions(storeId, next.id).queryKey, next);
      save.reset();
    },
  });
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
      if (draft)
        void navigate({
          to: "/admin/stores/$storeId/menu/changes/$draftId/$section",
          params: { storeId, draftId: draft.id, section },
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
          draft ? (
            <Link
              search={true}
              to="/admin/stores/$storeId/menu/changes/$draftId/$section"
              params={{ storeId, draftId: draft.id, section }}
            />
          ) : (
            <Link to="/admin/stores/$storeId/menu/$section" params={{ storeId, section }} />
          )
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
              dirty={dirty || (itemId === "new" && !newSaved.current)}
              pending={save.isPending}
              error={save.error || reload.error}
            />
          )
        }
      </form.Subscribe>
      {draft && catalog.data && editable && catalog.data.version !== draft.baseVersion && (
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
                disabled={!editable || save.isPending}
                className="min-w-0 space-y-5 [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-base [&_input:disabled]:opacity-100 [&_textarea:disabled]:opacity-100 [&_select:disabled]:opacity-100"
              >
                {section === "products" && (
                  <ProductsEditor
                    value={configuration}
                    selectedId={selectedId}
                    onChange={(next) => form.setFieldValue("configuration", next)}
                    disabled={!editable}
                  />
                )}
                {section === "categories" && (
                  <CategoriesEditor
                    value={configuration}
                    selectedId={selectedId}
                    onChange={(next) => form.setFieldValue("configuration", next)}
                    disabled={!editable}
                  />
                )}
                {section === "plans" && (
                  <PlansEditor
                    value={configuration}
                    selectedId={selectedId}
                    onChange={(next) => form.setFieldValue("configuration", next)}
                    disabled={!editable}
                  />
                )}
                {section === "cast" && (
                  <CastEditor
                    storeId={storeId}
                    value={configuration.cast}
                    voices={[initial.cast.voice]}
                    onChange={(cast) =>
                      form.setFieldValue("configuration", { ...configuration, cast })
                    }
                    disabled={!editable}
                  />
                )}
              </fieldset>
            )}
          </form.Subscribe>
          {editable && (
            <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-white py-4">
              <form.Subscribe selector={(state) => state.isDirty}>
                {(dirty) => (
                  <div className="flex items-center gap-3">
                    <Button
                      type="submit"
                      data-pwa-blocked={dirty || save.isPending}
                      disabled={save.isPending || (!dirty && itemId !== "new")}
                    >
                      <Save />
                      {t("common_save")}
                    </Button>
                    {dirty && (
                      <span role="status" className="text-sm text-muted-foreground">
                        {t("admin_unsaved")}
                      </span>
                    )}
                  </div>
                )}
              </form.Subscribe>
              {itemId !== "new" && section !== "cast" && (
                <ConfirmAction
                  label={t("menu_remove_item")}
                  subject={t("menu_remove_note")}
                  disabled={remove.isPending || save.isPending || reload.isPending}
                  onConfirm={() => remove.mutate()}
                  icon={<Trash2 />}
                />
              )}
              <form.Subscribe selector={(state) => state.isDirty}>
                {(dirty) => (
                  <>
                    {dirty && (
                      <ConfirmAction
                        label={t("workflow_revert")}
                        subject={t("workflow_revert_note")}
                        disabled={save.isPending || reload.isPending}
                        onConfirm={() => {
                          form.reset({ configuration: initial });
                          save.reset();
                        }}
                        icon={<Undo2 />}
                      />
                    )}
                    {draft && (
                      <Button
                        nativeButton={false}
                        role="link"
                        variant="outline"
                        disabled={
                          dirty || save.isPending || (itemId === "new" && !newSaved.current)
                        }
                        render={
                          <Link
                            to="/admin/stores/$storeId/menu/changes/$draftId"
                            params={{ storeId, draftId: draft.id }}
                            search={true}
                          />
                        }
                      >
                        {t("workflow_review")}
                      </Button>
                    )}
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
          disabled={reload.isPending}
          onConfirm={() => reload.mutate()}
          icon={<Undo2 />}
        />
      )}
      {editable && <p className="text-sm text-muted-foreground">{t("workflow_save_first")}</p>}
    </section>
  );
}
