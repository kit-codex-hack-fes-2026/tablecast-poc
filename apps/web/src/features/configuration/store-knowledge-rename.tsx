import type { StoreSkill } from "@tablecast/api/schema";
import { FilePenLine } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { KnowledgeFileDialog } from "./store-knowledge-file-dialog";

export function KnowledgeRename({
  skills,
  skill,
  path,
  disabled,
  onChange,
  onSelect,
  returnFocus,
}: {
  disabled: boolean;
  onChange: (value: StoreSkill[]) => void;
  onSelect: (value: { path: string; skillId: string }) => void;
  path: string;
  returnFocus?: () => false | HTMLElement;
  skill: StoreSkill;
  skills: StoreSkill[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <FilePenLine />
        {t("knowledge_rename")}
      </Button>
      {open && (
        <KnowledgeFileDialog
          skills={skills}
          disabled={disabled}
          action={{
            type: path === "SKILL.md" ? "rename-skill" : "rename-file",
            skillId: skill.id,
            path,
          }}
          onChange={onChange}
          onSelect={onSelect}
          onClose={() => setOpen(false)}
          returnFocus={returnFocus}
        />
      )}
    </>
  );
}
