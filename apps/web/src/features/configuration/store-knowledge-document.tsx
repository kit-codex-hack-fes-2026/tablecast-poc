import type { ReactNode } from "react";
import { type StoreSkill, storeSkillLimits } from "@tablecast/api/schema";
import { Eye, FileCode2, FilePlus2, ImagePlus, Pencil, Trash2 } from "lucide-react";
import type { KnowledgeSelection } from "./store-knowledge-tree";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { ConfigurationImageField } from "./configuration-image-field";
import { KnowledgeMarkdownEditor } from "./store-knowledge-markdown";
import { KnowledgePreview, KnowledgeSource } from "./store-knowledge-preview";
type KnowledgeFile = StoreSkill["files"][number];

export function KnowledgeDocument({
  skill,
  file,
  mode,
  onModeChange,
  rename,
  storeId,
  disabled,
  action,
  onChange,
  onSelect,
  onAdd,
  onAddImage,
  onRemove,
}: {
  action?: ReactNode;
  disabled: boolean;
  file: KnowledgeFile;
  mode: string;
  onAdd: (file: KnowledgeFile) => void;
  onAddImage: () => void;
  onChange?: (skill: StoreSkill) => void;
  onModeChange: (value: string) => void;
  onRemove: () => void;
  onSelect: (selection: KnowledgeSelection) => void;
  rename?: ReactNode;
  skill: StoreSkill;
  storeId: string;
}) {
  const { t } = useI18n();
  const updateSkill = (next: StoreSkill) => onChange?.(next);
  function updateFile(next: KnowledgeFile) {
    updateSkill({ ...skill, files: skill.files.map((item) => (item === file ? next : item)) });
    onSelect({ skillId: skill.id, path: next.path });
  }
  function removeFile() {
    updateSkill({ ...skill, files: skill.files.filter((item) => item !== file) });
    onSelect({ skillId: skill.id, path: "SKILL.md" });
  }
  return (
    <div className="min-w-0">
      <Tabs.Root
        value={mode}
        onValueChange={(next) => onModeChange(String(next))}
        className="min-w-0"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
          <p
            className="min-w-0 flex-1 truncate font-mono text-sm"
            title={`${skill.id}/${file.path}`}
          >
            {file.path}
          </p>
          <Tabs.List aria-label={t("knowledge_view")} className="gap-1 rounded-lg p-1">
            <Tabs.Tab
              value="preview"
              className="data-active:border-info-border data-active:bg-info-soft data-active:bg-none data-active:text-info-text data-active:shadow-none data-active:hover:border-info-border data-active:hover:bg-info-hover data-active:hover:text-info-text"
            >
              <Eye />
              {t("prompt_preview")}
            </Tabs.Tab>
            <Tabs.Tab
              value="source"
              className="data-active:border-info-border data-active:bg-info-soft data-active:bg-none data-active:text-info-text data-active:shadow-none data-active:hover:border-info-border data-active:hover:bg-info-hover data-active:hover:text-info-text"
            >
              <FileCode2 />
              {t("knowledge_source")}
            </Tabs.Tab>
            {onChange && (
              <Tabs.Tab
                value="edit"
                disabled={disabled}
                className="data-active:border-info-border data-active:bg-info-soft data-active:bg-none data-active:text-info-text data-active:shadow-none data-active:hover:border-info-border data-active:hover:bg-info-hover data-active:hover:text-info-text"
              >
                <Pencil />
                {t("knowledge_edit_file")}
              </Tabs.Tab>
            )}
          </Tabs.List>
          {action}
        </div>
        <Tabs.Panel
          value="preview"
          className="max-h-[70vh] min-h-72 min-w-0 overflow-auto p-3 sm:p-4"
        >
          <KnowledgePreview
            skill={skill}
            file={file}
            onOpen={(path) => onSelect({ skillId: skill.id, path })}
          />
        </Tabs.Panel>
        <Tabs.Panel value="source" className="max-h-[70vh] min-h-72 min-w-0 overflow-auto p-3">
          {onChange && "content" in file ? (
            <KnowledgeTextSource
              value={file.content}
              disabled={disabled}
              onChange={(content) => updateFile({ ...file, content })}
            />
          ) : (
            <KnowledgeSource
              content={"content" in file ? file.content : JSON.stringify(file, null, 2)}
              path={"content" in file ? file.path : "image.json"}
            />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="edit" className="max-h-[70vh] min-h-72 space-y-3 overflow-auto p-3">
          <fieldset disabled={disabled} className="grid min-w-0 gap-4">
            {"content" in file ? (
              /\.md$/i.test(file.path) ? (
                <KnowledgeMarkdownEditor
                  key={`${skill.id}/${file.path}`}
                  value={file.content}
                  path={file.path}
                  skill={skill}
                  storeId={storeId}
                  disabled={disabled}
                  onChange={(content, image) => {
                    const files = skill.files.map((item) =>
                      item === file ? { ...file, content } : item,
                    );
                    updateSkill({ ...skill, files: image ? [...files, image] : files });
                  }}
                />
              ) : (
                <KnowledgeTextSource
                  value={file.content}
                  disabled={disabled}
                  onChange={(content) => updateFile({ ...file, content })}
                />
              )
            ) : (
              <>
                <label className="grid gap-2 text-sm">
                  {t("theme_alt")}
                  <Input
                    value={file.alt}
                    maxLength={300}
                    onChange={(event) => updateFile({ ...file, alt: event.target.value })}
                  />
                </label>
                <ConfigurationImageField
                  storeId={storeId}
                  value={file}
                  disabled={disabled}
                  onChange={(image) => {
                    if (!image.imageKey) removeFile();
                    else if (image.imageSource)
                      updateFile({
                        ...file,
                        imageKey: image.imageKey,
                        imageKind: image.imageKind,
                        imageSource: image.imageSource,
                      });
                  }}
                />
              </>
            )}
          </fieldset>
        </Tabs.Panel>
      </Tabs.Root>
      {onChange && (
        <div className="flex flex-wrap gap-1 border-t border-border p-2">
          {rename}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || skill.files.length >= storeSkillLimits.files}
            onClick={() => {
              let next = skill.files.length;
              while (skill.files.some((entry) => entry.path === `references/guide-${next}.md`))
                next++;
              onAdd({ path: `references/guide-${next}.md`, content: "" });
              onModeChange("edit");
            }}
          >
            <FilePlus2 />
            {t("knowledge_add_file")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || skill.files.length >= storeSkillLimits.files}
            onClick={onAddImage}
          >
            <ImagePlus />
            {t("knowledge_add_image")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || file.path === "SKILL.md"}
            onClick={removeFile}
          >
            <Trash2 />
            {t("knowledge_remove_file")}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
            <Trash2 />
            {t("knowledge_remove_skill")}
          </Button>
        </div>
      )}
    </div>
  );
}

function KnowledgeTextSource({
  value,
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useI18n();
  return (
    <label className="grid gap-2 text-sm">
      {t("knowledge_content")}
      <textarea
        aria-label={t("knowledge_content")}
        aria-invalid={value.length > storeSkillLimits.fileCharacters}
        disabled={disabled}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-80 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-6"
      />
      <span className="text-xs text-muted-foreground">
        {value.length.toLocaleString()} / {storeSkillLimits.fileCharacters.toLocaleString()}
      </span>
    </label>
  );
}
