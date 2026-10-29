import {
  type StoreSkill,
  storeSkillLimits,
  storeSkillSchema,
  storeSkillsSchema,
} from "@tablecast/api/schema";
import { FilePlus2, ImagePlus, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import type { ImageValue } from "./configuration-image-model";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScroll,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { ConfigurationImageField } from "./configuration-image-field";
import { KnowledgePreview, KnowledgeSource } from "./store-knowledge-preview";
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
  disabled = false,
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
  const [selected, setSelected] = useState<KnowledgeSelection>();
  const [imageDialog, setImageDialog] = useState(false);
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
      className="min-w-0 scroll-mt-80 space-y-4 md:scroll-mt-40"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
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
      <p className="text-sm text-muted-foreground">{t("knowledge_hint")}</p>
      {value.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">{t("knowledge_empty")}</p>
          {action}
        </div>
      ) : (
        <div className="@container overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid min-w-0 @2xl:grid-cols-[16rem_minmax(0,1fr)]">
            <aside className="max-h-52 min-w-0 overflow-auto border-b border-border bg-muted/20 @2xl:max-h-[70vh] @2xl:border-r @2xl:border-b-0">
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
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p
            className="min-w-0 flex-1 truncate font-mono text-sm"
            title={`${skill.id}/${file.path}`}
          >
            {file.path}
          </p>
          <Tabs.List aria-label={t("knowledge_view")} className="gap-1 rounded-lg p-1">
            <Tabs.Tab value="preview">{t("prompt_preview")}</Tabs.Tab>
            <Tabs.Tab value="source">{t("knowledge_source")}</Tabs.Tab>
            {onChange && (
              <Tabs.Tab value="edit" disabled={disabled}>
                {t("knowledge_edit_file")}
              </Tabs.Tab>
            )}
          </Tabs.List>
          {action}
        </div>
        <Tabs.Panel
          value="preview"
          className="max-h-[70vh] min-h-96 min-w-0 overflow-auto p-5 sm:p-6"
        >
          <KnowledgePreview
            skill={skill}
            file={file}
            onOpen={(path) => onSelect({ skillId: skill.id, path })}
          />
        </Tabs.Panel>
        <Tabs.Panel value="source" className="max-h-[70vh] min-h-96 min-w-0 overflow-auto p-4">
          <KnowledgeSource
            content={"content" in file ? file.content : JSON.stringify(file, null, 2)}
            path={"content" in file ? file.path : "image.json"}
          />
        </Tabs.Panel>
        <Tabs.Panel
          value="edit"
          className="max-h-[70vh] min-h-96 space-y-5 overflow-auto p-4 sm:p-6"
        >
          <fieldset disabled={disabled} className="grid min-w-0 gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                {t("knowledge_skill_id")}
                <Input
                  value={skill.id}
                  maxLength={64}
                  onChange={(event) => {
                    const skillId = event.target.value;
                    updateSkill({ ...skill, id: skillId });
                    onSelect({ skillId, path: file.path });
                  }}
                />
              </label>
              <label className="grid gap-2 text-sm">
                {t("knowledge_path")}
                <Input
                  disabled={file.path === "SKILL.md"}
                  value={file.path}
                  maxLength={160}
                  onChange={(event) => updateFile({ ...file, path: event.target.value })}
                />
              </label>
            </div>
            {"content" in file ? (
              <label className="grid gap-2 text-sm">
                {t("knowledge_content")}
                <textarea
                  spellCheck={false}
                  aria-label={t("knowledge_content")}
                  aria-invalid={file.content.length > storeSkillLimits.fileCharacters}
                  value={file.content}
                  onChange={(event) => updateFile({ ...file, content: event.target.value })}
                  className="min-h-80 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-6"
                />
                <span className="text-xs text-muted-foreground">
                  {file.content.length.toLocaleString()} /{" "}
                  {storeSkillLimits.fileCharacters.toLocaleString()}
                </span>
              </label>
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

function KnowledgeImageDialog({
  skill,
  storeId,
  disabled,
  onOpenChange,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (file: KnowledgeFile) => void;
  onOpenChange: (open: boolean) => void;
  skill: StoreSkill;
  storeId: string;
}) {
  const { t } = useI18n();
  const [path, setPath] = useState(`assets/image-${skill.files.length}.webp`);
  const [alt, setAlt] = useState("");
  const [image, setImage] = useState<ImageValue>({ imageKey: null, imageKind: "photograph" });
  const candidate =
    image.imageKey && image.imageSource
      ? {
          path,
          alt,
          imageKey: image.imageKey,
          imageKind: image.imageKind,
          imageSource: image.imageSource,
        }
      : undefined;
  const valid =
    candidate &&
    storeSkillSchema.safeParse({ ...skill, files: [...skill.files, candidate] }).success;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("knowledge_add_image")}</DialogTitle>
          <DialogDescription>{t("knowledge_image_hint")}</DialogDescription>
        </DialogHeader>
        <DialogScroll className="space-y-4">
          <label className="grid gap-2 text-sm">
            {t("knowledge_path")}
            <Input value={path} onChange={(event) => setPath(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm">
            {t("theme_alt")}
            <Input value={alt} maxLength={300} onChange={(event) => setAlt(event.target.value)} />
          </label>
          <ConfigurationImageField
            storeId={storeId}
            value={image}
            onChange={setImage}
            disabled={disabled}
          />
        </DialogScroll>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common_cancel")}
          </Button>
          <Button
            type="button"
            disabled={disabled || !valid}
            onClick={() => {
              if (candidate && valid) onAdd(candidate);
            }}
          >
            {t("knowledge_add_image")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
