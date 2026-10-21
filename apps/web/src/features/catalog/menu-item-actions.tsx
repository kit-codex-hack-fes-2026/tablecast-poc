import { type ConfigDraft } from "@tablecast/api/schema";
import { Link } from "@tanstack/react-router";
import { Save, Trash2, Undo2 } from "lucide-react";
import type { useItemEditing } from "./menu-item-state";
import { ActionFeedback } from "../../components/action-feedback";
import { ConfirmAction } from "../../components/confirm-action";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { apiError } from "../../lib/api-error";
import { SaveStatus } from "../configuration/configuration-status";
import { ConfigurationToolbar } from "../configuration/configuration-toolbar";
import { type MenuListSearch, type MenuSection } from "../configuration/menu-model";

function ItemSaveAction({
  invalid = false,
  dirty,
  pending,
  uploadingImages,
  stagedImages,
  newUnsaved,
  isNew,
}: {
  dirty: boolean;
  invalid?: boolean;
  isNew: boolean;
  newUnsaved: boolean;
  pending: boolean;
  stagedImages: boolean;
  uploadingImages: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <Button
        type="submit"
        form="tablecast-item-editor"
        data-pwa-blocked={dirty || pending || uploadingImages || stagedImages || newUnsaved}
        disabled={invalid || pending || uploadingImages || (!dirty && !isNew)}
      >
        <Save />
        {t("common_save")}
      </Button>
      {(uploadingImages || stagedImages) && (
        <span role="status" className="text-sm text-muted-foreground">
          {t(uploadingImages ? "editor_image_wait" : "editor_image_staged")}
        </span>
      )}
    </div>
  );
}

export function ItemEditorActions({
  model,
  section,
  itemId,
  draft,
  search,
}: {
  draft: ConfigDraft;
  itemId: string;
  model: ReturnType<typeof useItemEditing>;
  search: MenuListSearch;
  section: MenuSection;
}) {
  const {
    t,
    storeId,
    dirty,
    pending,
    images,
    newSaved,
    invalidInstructions,
    remove,
    setConfiguration,
    initial,
    setEditor,
    save,
  } = model;
  return (
    <ConfigurationToolbar>
      <div className="flex flex-wrap items-center gap-2">
        <ItemSaveAction
          invalid={invalidInstructions}
          dirty={dirty}
          pending={pending}
          uploadingImages={images.uploading}
          stagedImages={images.hasStaged}
          newUnsaved={itemId === "new" && !newSaved}
          isNew={itemId === "new"}
        />

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

        <>
          {(dirty || images.hasStaged) && (
            <ConfirmAction
              label={t("workflow_revert")}
              subject={t("workflow_revert_note")}
              disabled={pending || images.uploading}
              onConfirm={() => {
                if (images.uploadingNow()) return;
                setConfiguration(initial);
                setEditor((current) => ({ ...current, conditionError: null }));
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
              (itemId === "new" && !newSaved)
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
      </div>
    </ConfigurationToolbar>
  );
}

export function ItemEditingStatus({
  model,
  itemId,
  draft,
}: {
  draft: ConfigDraft;
  itemId: string;
  model: ReturnType<typeof useItemEditing>;
}) {
  const { catalog, dirty, images, newSaved, save, reload, editable, t } = model;
  return (
    <>
      {catalog.data && (
        <ConfigurationToolbar slot="status">
          <SaveStatus
            dirty={dirty || images.hasStaged || (itemId === "new" && !newSaved)}
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

export function ItemSaveFeedback({ model }: { model: ReturnType<typeof useItemEditing> }) {
  const { save, remove, reload, editable, images, pending, t } = model;
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
          disabled={pending || images.uploading}
          onConfirm={() => {
            if (!images.uploadingNow() && !save.isPending) reload.mutate();
          }}
          icon={<Undo2 />}
        />
      )}
    </>
  );
}
