import type { StoreSkill } from "@tablecast/api/schema";
import { editStoreSkills } from "@tablecast/api/store-knowledge-files";
import { useIsMutating } from "@tanstack/react-query";
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/locale";
import { configurationImageUploadKey } from "./menu-query";
import { KnowledgeDocument } from "./store-knowledge-document";
import { type KnowledgeFileAction, KnowledgeFileDialog } from "./store-knowledge-file-dialog";
import { KnowledgeImageDialog } from "./store-knowledge-image-dialog";
import { type KnowledgeTreeAction, type KnowledgeTreeTarget } from "./store-knowledge-menu";
import { KnowledgeRename } from "./store-knowledge-rename";
import { KnowledgeSetupBanner } from "./store-knowledge-setup-banner";
import { KnowledgeTools } from "./store-knowledge-tools";
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

function newSkill(skills: StoreSkill[], title: string): StoreSkill {
  let index = skills.length + 1;
  while (skills.some((item) => item.id === `store-guide-${index}`)) index++;
  const id = `store-guide-${index}`;
  return {
    id,
    files: [
      { path: "SKILL.md", content: `---\nname: ${id}\ndescription: ${title}\n---\n\n# ${title}\n` },
    ],
  };
}
function newFilePath(skill: StoreSkill, directory: string) {
  let index = 1;
  const prefix = directory ? `${directory}/` : "";
  while (skill.files.some((entry) => entry.path === `${prefix}guide-${index}.md`)) index++;
  return `${prefix}guide-${index}.md`;
}

export function StoreKnowledge({
  value,
  storeId,
  onChange,
  disabled: inputDisabled = false,
  action,
  draftId,
}: {
  action?: ReactNode;
  disabled?: boolean;
  draftId?: string;
  onChange?: (value: StoreSkill[]) => void;
  storeId: string;
  value: StoreSkill[];
}) {
  const { t } = useI18n();
  const id = useId();
  const uploading = useIsMutating({ mutationKey: configurationImageUploadKey(storeId) }) > 0;
  const disabled = inputDisabled || uploading;
  const [selected, setSelected] = useState<KnowledgeSelection>();
  const [imageTarget, setImageTarget] = useState<{ directory: string; skillId: string }>();
  const [fileAction, setFileAction] = useState<KnowledgeFileAction>();
  const [mode, setMode] = useState("preview");
  const section = useRef<HTMLElement>(null);
  const focusAfterDelete = useRef(false);
  const { skill, file, selection } = selectedFile(value, selected);
  const editable = Boolean(onChange);
  const imageSkill = value.find((item) => item.id === imageTarget?.skillId);
  function returnFocus() {
    return (
      section.current?.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]') ??
      false
    );
  }
  useLayoutEffect(() => {
    if (focusAfterDelete.current) {
      focusAfterDelete.current = false;
      const target = returnFocus();
      if (target) target.focus();
    }
  });
  function treeAction(command: KnowledgeTreeAction, target: KnowledgeTreeTarget) {
    const selectedSkill = value.find((item) => item.id === target.skillId);
    if (!selectedSkill) return;
    const path = target.path || "SKILL.md";
    if (["preview", "source", "edit"].includes(command)) {
      if (command === "edit" && (!onChange || disabled)) return;
      setSelected({ skillId: target.skillId, path });
      setMode(command);
      return;
    }
    if (!onChange || disabled) return;
    if (command === "delete") {
      if (target.kind === "file" && path === "SKILL.md") return;
      onChange(
        editStoreSkills(
          value,
          target.kind === "skill"
            ? { type: "delete-skill", skillId: target.skillId }
            : { type: "delete-file", skillId: target.skillId, path },
        ),
      );
      if (target.kind === "file") setSelected({ skillId: target.skillId, path: "SKILL.md" });
      else if (selection?.skillId === target.skillId) setSelected(undefined);
      focusAfterDelete.current = true;
      return;
    }
    if (command === "rename") {
      setFileAction({
        type: target.kind === "skill" ? "rename-skill" : "rename-file",
        skillId: target.skillId,
        path,
      });
      return;
    }
    const directory =
      target.kind === "file" ? target.path.split("/").slice(0, -1).join("/") : target.path;
    if (command === "add-image") {
      setImageTarget({ directory, skillId: target.skillId });
      return;
    }
    setFileAction({
      type: "create-file",
      skillId: target.skillId,
      path: newFilePath(selectedSkill, directory),
    });
  }

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
      ref={section}
      id="store-knowledge"
      aria-labelledby={`${id}-heading`}
      className="min-w-0 scroll-mt-80 space-y-2 md:scroll-mt-40"
    >
      <KnowledgeSetupBanner storeId={storeId} draftId={draftId} />
      <KnowledgeTools
        headingId={`${id}-heading`}
        storeId={storeId}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onSelect={setSelected}
        onAddSkill={() => {
          const next = newSkill(value, t("knowledge_title"));
          onChange?.([...value, next]);
          setSelected({ skillId: next.id, path: "SKILL.md" });
        }}
      />
      {value.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">{t("knowledge_empty")}</p>
          {action}
        </div>
      ) : (
        <div className="@container overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid min-w-0 @2xl:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="max-h-52 min-w-0 overflow-auto border-b border-border bg-surface-subtle @2xl:max-h-[70vh] @2xl:border-r @2xl:border-b-0">
              <StoreKnowledgeTree
                skills={value}
                selected={selection}
                onSelect={setSelected}
                onAction={treeAction}
                editable={editable}
                disabled={disabled}
              />
            </aside>
            {skill && file && (
              <KnowledgeDocument
                skill={skill}
                file={file}
                storeId={storeId}
                mode={mode}
                onModeChange={setMode}
                disabled={disabled}
                action={action}
                onChange={onChange ? updateSkill : undefined}
                onSelect={setSelected}
                onAdd={addFile}
                onAddImage={() => setImageTarget({ skillId: skill.id, directory: "assets" })}
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
                      returnFocus={returnFocus}
                    />
                  )
                }
                onRemove={() => onChange?.(value.filter((item) => item !== skill))}
              />
            )}
          </div>
        </div>
      )}
      {fileAction && onChange && (
        <KnowledgeFileDialog
          action={fileAction}
          skills={value}
          disabled={disabled}
          onChange={onChange}
          onClose={() => setFileAction(undefined)}
          returnFocus={returnFocus}
          onSelect={(nextSelection) => {
            setSelected(nextSelection);
            if (fileAction.type === "create-file") setMode("edit");
          }}
        />
      )}
      {imageSkill && imageTarget && (
        <KnowledgeImageDialog
          skill={imageSkill}
          directory={imageTarget.directory || "assets"}
          storeId={storeId}
          disabled={disabled}
          onOpenChange={(open) => {
            if (!open) setImageTarget(undefined);
          }}
          onAdd={(next) => {
            onChange?.(
              value.map((item) =>
                item === imageSkill ? { ...item, files: [...item.files, next] } : item,
              ),
            );
            setSelected({ skillId: imageSkill.id, path: next.path });
            setImageTarget(undefined);
          }}
        />
      )}
    </section>
  );
}
