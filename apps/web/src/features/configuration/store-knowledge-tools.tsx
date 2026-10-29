import { type StoreSkill, storeSkillLimits, storeSkillsSchema } from "@tablecast/api/schema";
import { lintStoreSkills } from "@tablecast/api/store-knowledge-files";
import { FolderCode, Plus, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { KnowledgeSelection } from "./store-knowledge-tree";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { KnowledgeArchiveControls } from "./store-knowledge-archive";
import { KnowledgeLint } from "./store-knowledge-lint";

function lintTone(issues: ReturnType<typeof lintStoreSkills>) {
  if (issues.some((issue) => issue.severity === "error")) return "text-destructive";
  return issues.length ? "text-warning-text" : "text-success-text";
}

export function KnowledgeTools({
  value,
  storeId,
  disabled,
  onChange,
  onSelect,
  onAddSkill,
  headingId,
}: {
  disabled: boolean;
  headingId: string;
  onAddSkill: () => void;
  onChange?: (value: StoreSkill[]) => void;
  onSelect: (value: KnowledgeSelection) => void;
  storeId: string;
  value: StoreSkill[];
}) {
  const { t } = useI18n();
  const [showLint, setShowLint] = useState(false);
  const issues = useMemo(() => lintStoreSkills(value), [value]);
  const editable = Boolean(onChange);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
          <FolderCode className="size-5" />
          {t("knowledge_title")}
        </h2>
        {editable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || value.length >= storeSkillLimits.skills}
            onClick={onAddSkill}
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
          className={lintTone(issues)}
        >
          <ShieldCheck />
          {t("knowledge_lint")} · {issues.length}
        </Button>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t("knowledge_hint")}</p>
      </div>
      {showLint && (
        <KnowledgeLint
          issues={issues}
          onSelect={(item) => onSelect({ skillId: item.skillId, path: item.path })}
        />
      )}
      {editable && !storeSkillsSchema.safeParse(value).success && (
        <p role="alert" className="text-sm text-destructive">
          {t("knowledge_invalid")}
        </p>
      )}
    </>
  );
}
