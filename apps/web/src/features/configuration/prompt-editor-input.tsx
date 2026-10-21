import { instructionLimit, instructionText } from "@tablecast/api/schema";
import { Code2, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PromptEditorProps } from "./prompt-editor";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { InstructionView } from "./instruction-view";

export default function PromptEditorInput({
  id,
  labelledBy,
  language,
  value,
  onChange,
  disabled,
  focusRequested,
}: PromptEditorProps) {
  const { locale, t } = useI18n();
  const input = useRef<HTMLTextAreaElement>(null);
  const focused = useRef(false);
  const original = useRef(value);
  const emitted = useRef(value);
  const [mode, setMode] = useState("source");
  const source = instructionText(value);
  const count = source.length;
  useEffect(() => {
    // 再読込は新しい基準にするが、読込だけで構造化された旧本文を書き換えない。
    if (value !== emitted.current) original.current = value;
    emitted.current = value;
  }, [value]);
  useEffect(() => {
    if (!focusRequested) focused.current = false;
    if (focusRequested && !disabled && !focused.current) {
      focused.current = true;
      input.current?.focus();
    }
  }, [focusRequested, disabled]);
  return (
    <Tabs.Root
      value={mode}
      onValueChange={(next) => setMode(String(next))}
      className="min-w-0 space-y-2"
    >
      <div className="overflow-hidden rounded-xl border border-input bg-background shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 p-2">
          <Tabs.List aria-labelledby={labelledBy} className="max-w-full">
            <Tabs.Tab value="source">
              <Code2 className="size-4 shrink-0" aria-hidden="true" />
              {t("prompt_source")}
            </Tabs.Tab>
            <Tabs.Tab value="preview">
              <Eye className="size-4 shrink-0" aria-hidden="true" />
              {t("prompt_preview")}
            </Tabs.Tab>
          </Tabs.List>
        </div>
        <Tabs.Panel value="source" keepMounted>
          <textarea
            ref={input}
            id={id}
            aria-labelledby={labelledBy}
            aria-describedby={`${id}-hint${count > instructionLimit ? ` ${id}-limit` : ""}`}
            aria-invalid={count > instructionLimit}
            lang={language}
            disabled={disabled}
            spellCheck={false}
            rows={10}
            className="block field-sizing-content min-h-56 w-full resize-y rounded-b-xl bg-background p-4 font-mono text-base leading-7 text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            value={source}
            onChange={(event) => {
              const text = event.target.value;
              // 元の本文へUndoした場合は保存形式も元に戻す。
              const next = text === instructionText(original.current) ? original.current : text;
              emitted.current = next;
              onChange(next);
            }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="preview" className="min-h-56 p-4">
          {source.trim() ? (
            <InstructionView value={value} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("prompt_preview_empty")}</p>
          )}
        </Tabs.Panel>
      </div>
      <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <p id={`${id}-hint`} className="min-w-0">
          {t("prompt_markdown_hint")}
        </p>
        <span className="shrink-0 whitespace-nowrap tabular-nums" aria-hidden="true">
          {count.toLocaleString(locale)} / {instructionLimit.toLocaleString(locale)}
        </span>
      </div>
      {count > instructionLimit && (
        <p id={`${id}-limit`} role="alert" className="text-sm text-destructive">
          {t("prompt_limit")}
        </p>
      )}
    </Tabs.Root>
  );
}
