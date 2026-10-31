import type { KnowledgeIssue } from "@tablecast/api/store-knowledge-files";
import { AlertTriangle, CheckCircle2, FileWarning, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
const labels = {
  SKILL_REQUIRED: "knowledge_lint_skill_required",
  FRONTMATTER_REQUIRED: "knowledge_lint_frontmatter_required",
  FRONTMATTER_INVALID: "knowledge_lint_frontmatter_invalid",
  METADATA_INVALID: "knowledge_lint_metadata_invalid",
  NAME_MISMATCH: "knowledge_lint_name_mismatch",
  BODY_EMPTY: "knowledge_lint_body_empty",
  BODY_LONG: "knowledge_lint_body_long",
  REFERENCE_MISSING: "knowledge_lint_reference_missing",
} as const;
export function KnowledgeLint({
  issues,
  onSelect,
}: {
  issues: KnowledgeIssue[];
  onSelect: (issue: KnowledgeIssue) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="region"
      aria-label={t("knowledge_lint")}
      className="space-y-1 rounded-md border border-border p-2"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-muted-foreground" />
        {t("knowledge_lint")}
      </h3>
      {issues.length ? (
        issues.map((issue) => (
          <Button
            type="button"
            key={`${issue.skillId}/${issue.path}/${issue.line}/${issue.code}/${issue.reference ?? ""}`}
            variant="ghost"
            size="sm"
            className={`h-auto w-full justify-start text-left ${issue.severity === "error" ? "text-destructive" : "text-warning-text"}`}
            onClick={() => onSelect(issue)}
          >
            {issue.severity === "error" ? <FileWarning /> : <AlertTriangle />}
            <span>
              <span className="font-mono text-xs">
                {issue.skillId}/{issue.path}:{issue.line}
              </span>
              <span className="block">
                {t(labels[issue.code])}
                {issue.reference && ` · ${issue.reference}`}
              </span>
            </span>
          </Button>
        ))
      ) : (
        <p className="flex items-center gap-2 py-1 text-sm text-success-text">
          <CheckCircle2 className="size-4" />
          {t("knowledge_lint_pass")}
        </p>
      )}
    </div>
  );
}
