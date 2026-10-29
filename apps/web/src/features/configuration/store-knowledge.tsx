import { type StoreSkill, storeSkillLimits, storeSkillsSchema } from "@tablecast/api/schema";
import { lintStoreSkills } from "@tablecast/api/store-knowledge-files";
import { useIsMutating } from "@tanstack/react-query";
import {
  Eye,
  FileCode2,
  FilePlus2,
  FolderCode,
  ImagePlus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { ConfigurationImageField } from "./configuration-image-field";
import { configurationImageUploadKey } from "./menu-query";
import { KnowledgeArchiveControls } from "./store-knowledge-archive";
import { KnowledgeImageDialog } from "./store-knowledge-image-dialog";
import { KnowledgeLint } from "./store-knowledge-lint";
import { KnowledgeMarkdownEditor } from "./store-knowledge-markdown";
import { KnowledgePreview, KnowledgeSource } from "./store-knowledge-preview";
import { KnowledgeRename } from "./store-knowledge-rename";
import { type KnowledgeSelection, StoreKnowledgeTree } from "./store-knowledge-tree";

type KnowledgeFile = StoreSkill["files"][number];
function selectedFile(skills: StoreSkill[], selected?: KnowledgeSelection) {
  const skill = skills.find((item) => item.id === selected?.skillId) ?? skills[0];
  const file =
    skill?.files.find((item) => item.path === selected?.path) ??
    skill?.files.find((item) => item.path === "SKILL.md") ??
    skill?.files[0];
  const selection = skill && file ? { skillId: skill.id, path: file.path } : undefined;
  return { skill, file, selection };
}

export function StoreKnowledge({
  value,
  storeId,
  onChange,
  disabled: inputDisabled = false,
  action,
}: {
  action?: ReactNode;
  disabled?: boolean;
  onChange?: (value: StoreSkill[]) => void;
  storeId: string;
  value: StoreSkill[];
}) {
  const { t } = useI18n();
  const id = useId();
  const uploading = useIsMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0;
  const disabled = inputDisabled || uploading;
  const [selected, setSelected] = useState<KnowledgeSelection>();
  const [imageDialog, setImageDialog] = useState(false);
  const [showLint, setShowLint] = useState(false);
  const issues = useMemo(() => lintStoreSkills(value), [value]);
  const { skill, file, selection } = selectedFile(value, selected);
  const editable = Boolean(onChange);
  function updateSkill(next: StoreSkill) {
    onChange?.(value.map((item) => (item === skill ? next : item)));
  }
  function addFile(next: KnowledgeFile) {
    if (!skill) return;
    updateSkill({ ...skill, files: [...skill.files, next] });
    setSelected({ skillId: skill.id, path: next.path });
  }
  return (
    <section
      id="store-knowledge"
      aria-labelledby={`${id}-heading`}
      className="min-w-0 scroll-mt-80 space-y-2 md:scroll-mt-40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={`${id}-heading`}
          className="flex items-center gap-2 text-lg font-semibold text-nav-menu"
        >
          <FolderCode className="size-5" />
          {t("knowledge_title")}
        </h2>
        {editable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || value.length >= storeSkillLimits.skills}
            onClick={() => {
              let next = value.length + 1;
              while (value.some((item) => item.id === `store-guide-${next}`)) next++;
              const skillId = `store-guide-${next}`;
              onChange?.([
                ...value,
                {
                  id: skillId,
                  files: [
                    {
                      path: "SKILL.md",
                      content: `---\nname: ${skillId}\ndescription: ${t("knowledge_title")}\n---\n\n# ${t("knowledge_title")}\n`,
                    },
                  ],
                },
              ]);
              setSelected({ skillId, path: "SKILL.md" });
            }}
          >
            <Plus />
            {t("knowledge_add_skill")}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <KnowledgeArchiveControls
          storeId={storeId}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowLint((previous) => !previous)}
          aria-expanded={showLint}
          className={
            issues.some((issue) => issue.severity === "error")
              ? "text-destructive"
              : "text-success-text"
          }
        >
          <ShieldCheck />
          {t("knowledge_lint")} · {issues.length}
        </Button>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t("knowledge_hint")}</p>
      </div>
      {showLint && (
        <KnowledgeLint
          issues={issues}
          onSelect={(item) => setSelected({ skillId: item.skillId, path: item.path })}
        />
      )}
      {value.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">{t("knowledge_empty")}</p>
          {action}
        </div>
      ) : (
        <div className="@container overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid min-w-0 @2xl:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="max-h-52 min-w-0 overflow-auto border-b border-border bg-surface-subtle @2xl:max-h-[70vh] @2xl:border-r @2xl:border-b-0">
              <StoreKnowledgeTree skills={value} selected={selection} onSelect={setSelected} />
            </aside>
            {skill && file && (
              <KnowledgeDocument
                skill={skill}
                file={file}
                storeId={storeId}
                disabled={disabled}
                action={action}
                onChange={onChange ? updateSkill : undefined}
                onSelect={setSelected}
                onAdd={addFile}
                onAddImage={() => setImageDialog(true)}
                rename={
                  onChange && (
                    <KnowledgeRename
                      key={`${skill.id}/${file.path}`}
                      skills={value}
                      skill={skill}
                      path={file.path}
                      disabled={disabled}
                      onChange={onChange}
                      onSelect={setSelected}
                    />
                  )
                }
                onRemove={() => onChange?.(value.filter((item) => item !== skill))}
              />
            )}
          </div>
        </div>
      )}
      {editable && !storeSkillsSchema.safeParse(value).success && (
        <p role="alert" className="text-sm text-destructive">
          {t("knowledge_invalid")}
        </p>
      )}
      {skill && imageDialog && (
        <KnowledgeImageDialog
          skill={skill}
          storeId={storeId}
          disabled={disabled}
          onOpenChange={setImageDialog}
          onAdd={(next) => {
            addFile(next);
            setImageDialog(false);
          }}
        />
      )}
    </section>
  );
}

function KnowledgeDocument({
  skill,
  file,
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
  onAdd: (file: KnowledgeFile) => void;
  onAddImage: () => void;
  onChange?: (skill: StoreSkill) => void;
  onRemove: () => void;
  onSelect: (selection: KnowledgeSelection) => void;
  rename?: ReactNode;
  skill: StoreSkill;
  storeId: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState("preview");
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
      <Tabs.Root value={mode} onValueChange={(next) => setMode(String(next))} className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
          <p
            className="min-w-0 flex-1 truncate font-mono text-sm"
            title={`${skill.id}/${file.path}`}
          >
            {file.path}
          </p>
          <Tabs.List aria-label={t("knowledge_view")} className="gap-1 rounded-lg p-1">
            <Tabs.Tab value="preview" className="data-active:[&_svg]:text-primary-foreground">
              <Eye className="text-info-text" />
              {t("prompt_preview")}
            </Tabs.Tab>
            <Tabs.Tab value="source" className="data-active:[&_svg]:text-primary-foreground">
              <FileCode2 className="text-nav-menu" />
              {t("knowledge_source")}
            </Tabs.Tab>
            {onChange && (
              <Tabs.Tab
                value="edit"
                disabled={disabled}
                className="data-active:[&_svg]:text-primary-foreground"
              >
                <Pencil className="text-success-text" />
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
              setMode("edit");
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
