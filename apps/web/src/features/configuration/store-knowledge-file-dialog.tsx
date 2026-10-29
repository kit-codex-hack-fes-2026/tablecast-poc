import type { StoreSkill } from "@tablecast/api/schema";
import { editStoreSkills } from "@tablecast/api/store-knowledge-files";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";

export type KnowledgeFileAction = {
  path: string;
  skillId: string;
  type: "create-file" | "rename-file" | "rename-skill";
};
function editedFiles(skills: StoreSkill[], action: KnowledgeFileAction, name: string) {
  const creating = action.type === "create-file";
  const skillName = action.type === "rename-skill";
  try {
    if (
      creating &&
      skills
        .find((skill) => skill.id === action.skillId)
        ?.files.some((file) => file.path.toLowerCase() === name.toLowerCase())
    )
      throw new Error("KNOWLEDGE_FILE_EXISTS");
    return editStoreSkills(
      skills,
      skillName
        ? { type: "rename-skill", skillId: action.skillId, newId: name }
        : creating
          ? { type: "put-file", skillId: action.skillId, file: { path: name, content: "" } }
          : { type: "rename-file", skillId: action.skillId, path: action.path, newPath: name },
    );
  } catch {
    return undefined;
  }
}

export function KnowledgeFileDialog({
  action,
  skills,
  disabled,
  onChange,
  onSelect,
  onClose,
  returnFocus,
}: {
  action: KnowledgeFileAction;
  disabled: boolean;
  onChange: (value: StoreSkill[]) => void;
  onClose: () => void;
  onSelect: (value: { path: string; skillId: string }) => void;
  returnFocus?: () => false | HTMLElement;
  skills: StoreSkill[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(action.type === "rename-skill" ? action.skillId : action.path);
  const creating = action.type === "create-file";
  const skillName = action.type === "rename-skill";
  const next = editedFiles(skills, action, name);
  const valid = Boolean(next && (creating || name !== (skillName ? action.skillId : action.path)));
  function apply() {
    if (!valid || !next || disabled) return;
    onChange(next);
    onSelect({ skillId: skillName ? name : action.skillId, path: skillName ? "SKILL.md" : name });
    setOpen(false);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent finalFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{t(creating ? "knowledge_add_file" : "knowledge_rename")}</DialogTitle>
          <DialogDescription>
            {t(skillName ? "knowledge_rename_hint" : "knowledge_file_name_hint")}
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm">
          {t(skillName ? "knowledge_skill_id" : "knowledge_path")}
          <Input
            value={name}
            maxLength={skillName ? 64 : 160}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
            }}
          />
        </label>
        {!next && (
          <p role="alert" className="text-sm text-destructive">
            {t("knowledge_name_invalid")}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t("common_cancel")}
          </Button>
          <Button type="button" disabled={disabled || !valid} onClick={apply}>
            {t(creating ? "knowledge_add_file" : "common_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
