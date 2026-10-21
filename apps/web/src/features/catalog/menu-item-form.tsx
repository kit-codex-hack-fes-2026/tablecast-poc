import { type ConfigDraft, type Configuration } from "@tablecast/api/schema";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ImageStagedChange } from "../configuration/configuration-image-model";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { CastEditor } from "../configuration/configuration-editor";
import {
  castTargets,
  menuLabels,
  type MenuListSearch,
  type MenuSection,
} from "../configuration/menu-model";
import { CategoriesEditor } from "./categories-editor";
import { ItemEditingStatus, ItemEditorActions, ItemSaveFeedback } from "./menu-item-actions";
import { useItemEditing } from "./menu-item-state";
import { ProductSummary } from "./menu-product-details";
import { PlansEditor } from "./plans-editor";
import { ProductsEditor } from "./products-editor";

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
  const model = useItemEditing({ section, itemId, initialConfiguration, draft, search });
  const {
    storeId,
    locale,
    t,
    selectedId,
    editable,
    initial,
    configuration,
    conditionError,
    setConfiguration,
    submitConfiguration,
    pending,
    images,
    item,
  } = model;
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
            : (item?.text[locale].displayName ?? t(menuLabels[section]))
        }
      />
      <ItemEditingStatus model={model} itemId={itemId} draft={draft} />
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
          className="max-w-4xl space-y-6"
        >
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
              onChange={setConfiguration}
              disabled={!editable || pending}
            />
          </fieldset>

          {editable && (
            <ItemEditorActions
              model={model}
              section={section}
              itemId={itemId}
              draft={draft}
              search={search}
            />
          )}
        </form>
      )}
      <ItemSaveFeedback model={model} />
    </section>
  );
}

function ItemFields({
  section,
  retainedVoice,
  ...props
}: {
  disabled: boolean;
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
