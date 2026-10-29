import { type StoreSkill, storeSkillLimits, storeSkillsSchema } from "@tablecast/api/schema";
import { BookOpen, FileText, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { ConfigurationSection } from "./configuration-fields";
import { InstructionView } from "./instruction-view";

export function StoreKnowledge({
  value,
  onChange,
  disabled = false,
  action,
}: {
  action?: React.ReactNode;
  disabled?: boolean;
  onChange?: (value: StoreSkill[]) => void;
  value: StoreSkill[];
}) {
  const { t } = useI18n();
  const id = useId();
  const [selected, setSelected] = useState<{ path: string; skillId: string }>();
  const skill = value.find((item) => item.id === selected?.skillId) ?? value[0];
  const file = skill?.files.find((item) => item.path === selected?.path) ?? skill?.files[0];
  const editable = Boolean(onChange);
  function updateSkill(next: StoreSkill) {
    onChange?.(value.map((item) => (item === skill ? next : item)));
  }
  return (
    <ConfigurationSection title={t("knowledge_title")} icon={BookOpen} headingId={`${id}-heading`}>
      <p className="text-sm text-muted-foreground">{t("knowledge_hint")}</p>
      {action}
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
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
        </div>
      )}
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("knowledge_empty")}</p>
      ) : (
        <div className="grid min-w-0 overflow-hidden rounded-xl border border-border @2xl:grid-cols-[15rem_minmax(0,1fr)]">
          <nav
            aria-label={t("knowledge_files")}
            className="max-h-96 min-w-0 space-y-4 overflow-y-auto border-b border-border bg-muted/30 p-3 @2xl:border-r @2xl:border-b-0"
          >
            {value.map((item) => (
              <div key={item.id} className="min-w-0 space-y-1">
                <p className="wrap-anywhere px-2 text-sm font-semibold">{item.id}</p>
                {item.files.map((entry) => (
                  <Button
                    key={entry.path}
                    type="button"
                    variant={item === skill && entry === file ? "secondary" : "ghost"}
                    className="h-auto min-h-10 w-full justify-start py-2 text-left"
                    aria-current={item === skill && entry === file ? "page" : undefined}
                    onClick={() => setSelected({ skillId: item.id, path: entry.path })}
                  >
                    <FileText className="size-4 shrink-0" />
                    <span className="min-w-0 wrap-anywhere font-mono text-xs">{entry.path}</span>
                  </Button>
                ))}
              </div>
            ))}
          </nav>
          {skill && file && (
            <KnowledgeDocument
              skill={skill}
              file={file}
              disabled={disabled}
              onChange={onChange ? updateSkill : undefined}
              onSelect={setSelected}
              onRemove={() => onChange?.(value.filter((item) => item !== skill))}
            />
          )}
        </div>
      )}
      {editable && !storeSkillsSchema.safeParse(value).success && (
        <p role="alert" className="text-sm text-destructive">
          {t("knowledge_invalid")}
        </p>
      )}
    </ConfigurationSection>
  );
}

function KnowledgeDocument({
  skill,
  file,
  disabled,
  onChange,
  onSelect,
  onRemove,
}: {
  disabled: boolean;
  file: StoreSkill["files"][number];
  onChange?: (skill: StoreSkill) => void;
  onRemove: () => void;
  onSelect: (selection: { path: string; skillId: string }) => void;
  skill: StoreSkill;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState("preview");
  const editable = Boolean(onChange);
  const updateSkill = (next: StoreSkill) => onChange?.(next);
  function updateFile(change: Partial<StoreSkill["files"][number]>) {
    updateSkill({
      ...skill,
      files: skill.files.map((item) => (item === file ? { ...item, ...change } : item)),
    });
    onSelect({ skillId: skill.id, path: change.path ?? file.path });
  }
  return (
    <div className="min-w-0 space-y-3 p-3 sm:p-4">
      {editable && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            {t("knowledge_skill_id")}
            <Input
              disabled={disabled}
              value={skill.id}
              maxLength={64}
              onChange={(event) => {
                const skillId = event.target.value;
                updateSkill({ ...skill, id: skillId });
                onSelect({ skillId, path: file.path });
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t("knowledge_path")}
            <Input
              disabled={disabled || file.path === "SKILL.md"}
              value={file.path}
              maxLength={160}
              onChange={(event) => updateFile({ path: event.target.value })}
            />
          </label>
        </div>
      )}
      <p className="wrap-anywhere font-mono text-xs text-muted-foreground">
        {skill.id}/{file.path}
      </p>
      <Tabs.Root
        value={mode}
        onValueChange={(next) => setMode(String(next))}
        className="min-w-0 space-y-4"
      >
        <Tabs.List aria-label={t("knowledge_view")}>
          <Tabs.Tab value="preview">{t("prompt_preview")}</Tabs.Tab>
          <Tabs.Tab value="source">{t("knowledge_source")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="preview" className="min-h-48 min-w-0">
          {/\.md$/i.test(file.path) ? (
            <InstructionView value={file.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")} />
          ) : (
            <pre className="whitespace-pre-wrap wrap-anywhere font-mono text-sm">
              {file.content}
            </pre>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="source" className="min-w-0">
          {editable ? (
            <label className="grid gap-2 text-sm">
              {t("knowledge_content")}
              <textarea
                disabled={disabled}
                spellCheck={false}
                aria-invalid={file.content.length > storeSkillLimits.fileCharacters}
                value={file.content}
                onChange={(event) => updateFile({ content: event.target.value })}
                className="min-h-80 w-full resize-y rounded-lg border border-input bg-background p-3 font-mono text-sm leading-6"
              />
            </label>
          ) : (
            <pre className="whitespace-pre-wrap wrap-anywhere font-mono text-sm">
              {file.content}
            </pre>
          )}
        </Tabs.Panel>
      </Tabs.Root>
      {editable && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || skill.files.length >= storeSkillLimits.files}
            onClick={() => {
              let next = skill.files.length;
              while (skill.files.some((entry) => entry.path === `references/guide-${next}.md`))
                next++;
              const path = `references/guide-${next}.md`;
              updateSkill({ ...skill, files: [...skill.files, { path, content: "" }] });
              onSelect({ skillId: skill.id, path });
              setMode("source");
            }}
          >
            <Plus />
            {t("knowledge_add_file")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || file.path === "SKILL.md"}
            onClick={() => {
              updateSkill({ ...skill, files: skill.files.filter((entry) => entry !== file) });
              onSelect({ skillId: skill.id, path: "SKILL.md" });
            }}
          >
            <Trash2 />
            {t("knowledge_remove_file")}
          </Button>
          <Button type="button" variant="outline" disabled={disabled} onClick={() => onRemove()}>
            <Trash2 />
            {t("knowledge_remove_skill")}
          </Button>
        </div>
      )}
    </div>
  );
}
