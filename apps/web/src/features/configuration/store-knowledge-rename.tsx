import type { StoreSkill } from "@tablecast/api/schema";
import { editStoreSkills } from "@tablecast/api/store-knowledge-files";
import { FilePenLine } from "lucide-react";
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
export function KnowledgeRename({
  skills,
  skill,
  path,
  disabled,
  onChange,
  onSelect,
}: {
  disabled: boolean;
  onChange: (value: StoreSkill[]) => void;
  onSelect: (value: { path: string; skillId: string }) => void;
  path: string;
  skill: StoreSkill;
  skills: StoreSkill[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [skillId, setSkillId] = useState(skill.id);
  const [nextPath, setNextPath] = useState(path);
  let next: StoreSkill[] | undefined;
  try {
    const renamed =
      skillId === skill.id
        ? skills
        : editStoreSkills(skills, { type: "rename-skill", skillId: skill.id, newId: skillId });
    next =
      nextPath === path
        ? renamed
        : editStoreSkills(renamed, { type: "rename-file", skillId, path, newPath: nextPath });
  } catch {
    next = undefined;
  }
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setSkillId(skill.id);
          setNextPath(path);
          setOpen(true);
        }}
      >
        <FilePenLine />
        {t("knowledge_rename")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("knowledge_rename")}</DialogTitle>
            <DialogDescription>{t("knowledge_rename_hint")}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm">
            {t("knowledge_skill_id")}
            <Input
              value={skillId}
              maxLength={64}
              disabled={disabled}
              onChange={(event) => setSkillId(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            {t("knowledge_path")}
            <Input
              value={nextPath}
              maxLength={160}
              disabled={disabled || path === "SKILL.md"}
              onChange={(event) => setNextPath(event.target.value)}
            />
          </label>
          {!next && (
            <p role="alert" className="text-sm text-destructive">
              {t("knowledge_invalid")}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common_cancel")}
            </Button>
            <Button
              type="button"
              disabled={disabled || !next || (skillId === skill.id && nextPath === path)}
              onClick={() => {
                if (next) {
                  onChange(next);
                  onSelect({ skillId, path: nextPath });
                  setOpen(false);
                }
              }}
            >
              {t("common_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
