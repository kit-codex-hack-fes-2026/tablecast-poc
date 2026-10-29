import { resolveText } from "@tablecast/api/localization";
import {
  type ConfigDraft,
  type Configuration,
  configurationSchema,
  instructionLimit,
  instructionText,
} from "@tablecast/api/schema";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useBlocker,
  useLocation,
  useMatch,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ArrowLeft, Save, Trash2, Undo2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ActionFeedback } from "../../components/action-feedback";
import { ConfirmAction } from "../../components/confirm-action";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { apiError } from "../../lib/api-error";
import { CastEditor } from "../configuration/configuration-editor";
import { type ImageStagedChange } from "../configuration/configuration-image-model";
import { ConfigurationLanguages } from "../configuration/configuration-languages-context";
import { SaveStatus } from "../configuration/configuration-status";
import { ConfigurationToolbar } from "../configuration/configuration-toolbar";
import {
  addMenuItem,
  menuLabels,
  type MenuListSearch,
  type MenuSection,
  parseCastTarget,
} from "../configuration/menu-model";
import {
  configurationImageUploadKey,
  draftOptions,
  saveDraftOptions,
} from "../configuration/menu-query";
import { StoreLanguagesEditor } from "../configuration/store-languages-editor";
import { useStore } from "../store/store-context";
import { catalogOptions } from "./catalog-query";
import { CategoriesEditor } from "./categories-editor";
import { GuidesEditor } from "./guides-editor";
import { focusInvalidCondition } from "./menu-item-dom";
import { ProductSummary } from "./menu-product-details";
import { PlansEditor } from "./plans-editor";
import { ProductsEditor } from "./products-editor";

type ConditionError =
  | "condition_configuration_limit"
  | "condition_invalid"
  | "condition_product_limit"
  | null;

type EditorState = {
  conditionError: ConditionError;
  configuration: Configuration;
  initial: Configuration;
  newSaved: boolean;
  version: number;
};

function conditionValidationMessage(configuration: Configuration): ConditionError {
  const issues = configurationSchema.safeParse(configuration).error?.issues ?? [];
  if (issues.some((issue) => issue.message === "CONDITION_PRODUCT_LIMIT"))
    return "condition_product_limit";
  if (issues.some((issue) => issue.message === "CONDITION_CONFIGURATION_LIMIT"))
    return "condition_configuration_limit";
  return issues.some((issue) => issue.path.includes("conditions")) ? "condition_invalid" : null;
}
export function ItemForm({
  section,
  itemId,
  initialConfiguration,
  draft,
  search,
}: {
  draft: ConfigDraft;
  initialConfiguration: Configuration;
  itemId: string;
  search: MenuListSearch;
  section: MenuSection;
}) {
  const store = useStore();
  const storeId = store.id;
  const { locale, t } = useI18n();
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
  const uploadingNow = () =>
    client.isMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0;
  function resetImages() {
    staged.current.clear();
    setHasStaged(false);
    setFieldKey((key) => key + 1);
  }
  const navigate = useNavigate();
  const router = useRouter();
  const routeId = useMatch({ strict: false, select: (match) => match.routeId });
  const [newId] = useState(() => crypto.randomUUID());
  const selectedId = itemId === "new" ? newId : itemId;
  const editable =
    (draft.status === "draft" || draft.status === "ready") &&
    (store.role === "owner" || store.role === "admin");
  const catalog = useQuery(catalogOptions(storeId));
  // 設定全体の編集状態を保持し、再帰した条件をフォームの全深層キーへ展開しない。
  const [editor, setEditor] = useState<EditorState>(() => {
    const initial =
      itemId === "new"
        ? addMenuItem(initialConfiguration, section, selectedId)
        : initialConfiguration;
    return {
      initial,
      configuration: initial,
      version: draft.version,
      newSaved: false,
      conditionError: null,
    };
  });
  const { initial, configuration, version, newSaved, conditionError } = editor;
  const setConfiguration = (update: React.SetStateAction<Configuration>) =>
    setEditor((current) => ({
      ...current,
      configuration: typeof update === "function" ? update(current.configuration) : update,
    }));
  const dirty = configuration !== initial;
  const invalidInstructions =
    Object.values(configuration.cast.instructions).some(
      (instruction) => instructionText(instruction).length > instructionLimit,
    ) ||
    Object.values(configuration.cast.systemInstructions ?? {}).some(
      (instruction) =>
        instruction !== null && (!instruction.trim() || instruction.length > instructionLimit),
    );
  async function submitConfiguration(form: HTMLFormElement) {
    if (!editable || invalidInstructions || uploadingNow() || pending) return;
    const failure = conditionValidationMessage(configuration);
    setEditor((current) => ({ ...current, conditionError: failure }));
    if (failure) {
      focusInvalidCondition(form, failure !== "condition_invalid");
      return;
    }
    await save.mutateAsync(configuration).catch(() => undefined);
  }
  const hasUnsavedChanges = () =>
    editable && (dirty || staged.current.size > 0 || (itemId === "new" && !newSaved));
  useBlocker({
    shouldBlockFn: () =>
      uploadingNow() || (hasUnsavedChanges() && !window.confirm(t("menu_leave_unsaved"))),
    enableBeforeUnload: () => uploadingNow() || hasUnsavedChanges(),
  });
  const save = useMutation(
    saveDraftOptions(client, {
      storeId,
      id: draft.id,
      expectedVersion: version,
      onSaved: (next) => {
        setEditor({
          initial: next.configuration,
          configuration: next.configuration,
          version: next.version,
          newSaved: true,
          conditionError: null,
        });
        if (itemId === "new")
          void navigate({
            to: "/admin/stores/$storeId/menu/changes/$draftId/$section/$itemId",
            params: { storeId, draftId: next.id, section, itemId: selectedId },
            replace: true,
            search,
          });
        else void router.invalidate({ filter: (match) => match.routeId === routeId });
      },
    }),
  );
  const reload = useMutation({
    mutationFn: () => client.fetchQuery({ ...draftOptions(storeId, draft.id), staleTime: 0 }),
    onSuccess: (next) => {
      setEditor((current) => ({
        ...current,
        initial: next.configuration,
        configuration: next.configuration,
        version: next.version,
        conditionError: null,
      }));
      resetImages();
      save.reset();
      void router.invalidate({ filter: (match) => match.routeId === routeId });
    },
  });
  const pending = save.isPending || reload.isPending;
  const remove = useMutation({
    mutationFn: async () => {
      if (section === "cast") return;
      await save.mutateAsync({
        ...configuration,
        [section]: (configuration[section] ?? []).filter((item) => item.id !== selectedId),
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
    section === "cast" ? null : (initial[section] ?? []).find((value) => value.id === selectedId);
  function renderEditorActions() {
    return (
      <ConfigurationToolbar>
        <div className="flex flex-wrap items-center gap-2">
          {renderSaveAction()}

          {itemId !== "new" && section !== "cast" && (
            <ConfirmAction
              label={t("menu_remove_item")}
              subject={t("menu_remove_note")}
              disabled={remove.isPending || pending || uploading}
              onConfirm={() => {
                if (!uploadingNow()) remove.mutate();
              }}
              icon={<Trash2 />}
            />
          )}

          <>
            {(dirty || hasStaged) && (
              <ConfirmAction
                label={t("workflow_revert")}
                subject={t("workflow_revert_note")}
                disabled={pending || uploading}
                onConfirm={() => {
                  if (uploadingNow()) return;
                  setConfiguration(initial);
                  setEditor((current) => ({ ...current, conditionError: null }));
                  resetImages();
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
                dirty || pending || uploading || hasStaged || (itemId === "new" && !newSaved)
              }
              render={
                <Link
                  to="/admin/stores/$storeId/menu/changes/$draftId"
                  params={{ storeId, draftId: draft.id }}
                  search={{ ...search, returnSection: section }}
                  onClick={(event) => {
                    if (uploadingNow() || staged.current.size > 0) event.preventDefault();
                  }}
                />
              }
            >
              {t("workflow_review")}
            </Button>
          </>
        </div>
      </ConfigurationToolbar>
    );
  }
  function renderEditingStatus() {
    return (
      <>
        {catalog.data && (
          <ConfigurationToolbar slot="status">
            <SaveStatus
              dirty={dirty || hasStaged || (itemId === "new" && !newSaved)}
              pending={save.isPending}
              error={save.error || reload.error}
            />
          </ConfigurationToolbar>
        )}
        {catalog.data && editable && catalog.data.version !== draft.baseVersion && (
          <p className="text-destructive">{t("workflow_stale")}</p>
        )}
        {!editable && <p className="text-muted-foreground">{t("workflow_terminal_note")}</p>}
      </>
    );
  }
  function renderSaveFeedback() {
    return (
      <>
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
            disabled={pending || uploading}
            onConfirm={() => {
              if (!uploadingNow() && !save.isPending) reload.mutate();
            }}
            icon={<Undo2 />}
          />
        )}
      </>
    );
  }
  function renderSaveAction() {
    return (
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          form="tablecast-item-editor"
          data-pwa-blocked={
            dirty || pending || uploading || hasStaged || (itemId === "new" && !newSaved)
          }
          disabled={invalidInstructions || pending || uploading || (!dirty && !(itemId === "new"))}
        >
          <Save />
          {t("common_save")}
        </Button>
        {(uploading || hasStaged) && (
          <span role="status" className="text-sm text-muted-foreground">
            {t(uploading ? "editor_image_wait" : "editor_image_staged")}
          </span>
        )}
      </div>
    );
  }

  function renderEditor() {
    return (
      <section className="space-y-6">
        {conditionError && (
          <p role="alert" className="text-destructive">
            {t(conditionError)}
          </p>
        )}
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
        <PageHeader
          title={
            itemId === "new"
              ? t("common_add")
              : ((item ? resolveText(item.text, locale).displayName : undefined) ??
                t(menuLabels[section]))
          }
        />
        {renderEditingStatus()}
        {section === "products" &&
          configuration.products
            .filter((product) => product.id === selectedId)
            .map((product) => (
              <ProductSummary
                key={product.id}
                product={product}
                categories={configuration.categories}
              />
            ))}
        {section !== "cast" && !item ? (
          <p>{t("menu_item_missing")}</p>
        ) : (
          <form
            id="tablecast-item-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void submitConfiguration(event.currentTarget);
            }}
            className={section === "cast" ? "min-w-0 space-y-4" : "max-w-4xl space-y-6"}
          >
            <fieldset
              disabled={!editable || pending}
              className="min-w-0 space-y-8 [&_input:disabled]:opacity-100 [&_textarea:disabled]:opacity-100 [&_select:disabled]:opacity-100"
            >
              <ItemFields
                draftId={draft.id}
                key={section === "cast" ? "cast" : fieldKey}
                onImageStagedChange={onStagedChange}
                section={section}
                storeId={storeId}
                value={configuration}
                selectedId={selectedId}
                retainedVoice={initial.cast.voice}
                onChange={setConfiguration}
                disabled={!editable || pending}
              />
            </fieldset>

            {editable && renderEditorActions()}
          </form>
        )}
        {renderSaveFeedback()}
      </section>
    );
  }
  return (
    <ConfigurationLanguages value={configuration.languages}>
      <StoreLanguagesEditor
        value={configuration}
        onChange={setConfiguration}
        disabled={!editable || pending}
      />
      {renderEditor()}
    </ConfigurationLanguages>
  );
}

function ItemFields({
  section,
  retainedVoice,
  ...props
}: {
  disabled: boolean;
  draftId?: string;
  onChange: React.Dispatch<React.SetStateAction<Configuration>>;
  onImageStagedChange?: ImageStagedChange;
  retainedVoice: Configuration["cast"]["voice"];
  section: MenuSection;
  selectedId: string;
  storeId: string;
  value: Configuration;
}) {
  const hash = useLocation({ select: (location) => location.hash });
  if (section === "cast")
    return (
      <CastEditor
        focusTarget={parseCastTarget(hash)}
        storeId={props.storeId}
        draftId={props.draftId}
        value={props.value.cast}
        voices={[retainedVoice]}
        onChange={(cast) => props.onChange({ ...props.value, cast })}
        disabled={props.disabled}
      />
    );
  const Editor =
    section === "guides"
      ? GuidesEditor
      : section === "products"
        ? ProductsEditor
        : section === "categories"
          ? CategoriesEditor
          : PlansEditor;
  return <Editor {...props} />;
}
