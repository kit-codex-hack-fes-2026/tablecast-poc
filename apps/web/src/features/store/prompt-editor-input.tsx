import {
  instructionDocumentSchema,
  instructionLimit,
  instructionText,
  type CastInstruction,
} from "@tablecast/api/schema";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import type { ChainedCommands, Editor } from "@tiptap/core";
import { DOMParser as ProseMirrorParser } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { Bold, Italic, Undo2, Redo2 } from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { useI18n } from "../../i18n/locale";
import { instructionClipboard, instructionDocument } from "./prompt-editor-model";
import type { PromptEditorProps } from "./prompt-editor";

import { promptExtensions, type PromptCommand, type PromptMenu } from "./prompt-editor-extensions";

export default function PromptEditorInput({
  id,
  labelledBy,
  language,
  value,
  onChange,
  disabled,
  focusRequested,
}: PromptEditorProps) {
  const { t } = useI18n();
  const [notice, setNotice] = useState(false);
  const [structureRejected, setStructureRejected] = useState(false);
  const focused = useRef(false);
  const [menu, setMenu] = useState<PromptMenu | null>(null);
  const original = useRef(value);
  const emitted = useRef(value);
  const current = useRef({ onChange, disabled });
  useEffect(() => {
    current.current = { onChange, disabled };
  }, [onChange, disabled]);
  const commands = useMemo<PromptCommand[]>(
    () => [
      {
        id: "paragraph",
        label: t("prompt_paragraph"),
        search: "paragraph text 段落 本文",
        run: (chain) => chain.setParagraph(),
      },
      ...([1, 2, 3] as const).map((level) => ({
        id: `heading-${level}`,
        label: `${t("prompt_heading")} ${level}`,
        search: `heading ${level} 見出し`,
        run: (chain: ChainedCommands) => chain.toggleHeading({ level }),
      })),
      {
        id: "bulletList",
        label: t("prompt_bullet"),
        search: "bullet list 箇条書き リスト",
        run: (chain) => chain.toggleBulletList(),
      },
      {
        id: "orderedList",
        label: t("prompt_numbered"),
        search: "ordered numbered list 番号 数字",
        run: (chain) => chain.toggleOrderedList(),
      },
    ],
    [t],
  );
  const [runtime] = useState(() =>
    promptExtensions({ commands, menu: setMenu, invalid: () => setStructureRejected(true) }),
  );
  useEffect(() => {
    runtime.setCommands(commands);
  }, [runtime, commands]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: runtime.extensions,
    content: instructionDocument(value),
    editable: !disabled,
    editorProps: {
      handleDOMEvents: {
        keydown: (_view, event) => event.isComposing,
        drop: (_view, event) => {
          const data = event.dataTransfer;
          if (data?.files.length && !data.getData("text/html") && !data.getData("text/plain")) {
            setNotice(true);
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        lang: language,
        class:
          "min-h-56 p-4 outline-none whitespace-pre-wrap wrap-anywhere [&_p]:min-h-6 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_p+p]:mt-3",
      },
      handlePaste: (view, event) => {
        if (current.current.disabled) return true;
        const data = event.clipboardData;
        if (!data) return false;
        const html = data.getData("text/html");
        if (data.files.length) setNotice(true);
        if (!html) return data.files.length > 0 && !data.getData("text/plain");
        const incoming = instructionClipboard(html);
        if (incoming.omitted) setNotice(true);
        const content = ProseMirrorParser.fromSchema(view.state.schema).parseSlice(
          incoming.content,
        );
        // 除外後に本文がなければ、選択中の文章を空の貼付けで消さない。
        if (incoming.omitted && content.size === 0) return true;
        view.dispatch(view.state.tr.replaceSelection(content).scrollIntoView());
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (current.current.disabled) return true;
        const data = event.dataTransfer;
        if (!data) return false;
        if (data.files.length) {
          setNotice(true);
          if (!data.getData("text/html") && !data.getData("text/plain")) return true;
        }
        if (moved || !data.getData("text/html")) return false;
        const incoming = instructionClipboard(data.getData("text/html"));
        if (incoming.omitted) setNotice(true);
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (position)
          view.dispatch(
            view.state.tr
              .replaceRange(
                position.pos,
                position.pos,
                ProseMirrorParser.fromSchema(view.state.schema).parseSlice(incoming.content),
              )
              .scrollIntoView(),
          );
        return true;
      },
    },
    onUpdate: ({ editor: target }) => {
      if (current.current.disabled) return;
      const document = instructionDocumentSchema.parse(target.getJSON());
      const next: CastInstruction =
        typeof original.current === "string" &&
        target.state.doc.eq(target.schema.nodeFromJSON(instructionDocument(original.current)))
          ? original.current
          : { format: "tiptap-json", version: 1, document };
      emitted.current = next;
      current.current.onChange(next);
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    const doc = editor.schema.nodeFromJSON(instructionDocument(value));
    emitted.current = value;
    if (doc.eq(editor.state.doc)) return;
    original.current = value;
    editor.view.updateState(
      EditorState.create({ schema: editor.schema, doc, plugins: editor.state.plugins }),
    );
    editor.view.dispatch(editor.state.tr);
  }, [editor, value]);
  useEffect(() => {
    if (!focusRequested) focused.current = false;
    if (editor && focusRequested && !disabled && !focused.current) {
      focused.current = true;
      editor.commands.focus();
    }
  }, [editor, focusRequested, disabled]);
  useEffect(() => {
    if (menu)
      document
        .getElementById(`${id}-option-${menu.selected}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [menu, id]);
  const count = instructionText(value).length;
  useEffect(() => {
    if (!editor) return;
    updateAccessibility(editor.view.dom, disabled, count, id, menu);
  }, [editor, disabled, count, id, menu]);
  return (
    <div className="min-w-0 space-y-2">
      <div className="overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
        <PromptToolbar editor={editor} commands={commands} disabled={disabled} />
        <EditorContent editor={editor} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <p id={`${id}-hint`}>{t("prompt_hint")}</p>
        <p aria-live="polite">
          {count.toLocaleString()} / {instructionLimit.toLocaleString()}
        </p>
      </div>
      {count > instructionLimit && (
        <p role="alert" className="text-sm text-destructive">
          {t("prompt_limit")}
        </p>
      )}
      {structureRejected && (
        <p role="status" className="text-sm text-destructive">
          {t("prompt_structure")}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("prompt_omitted")}
        </p>
      )}
      {menu && !disabled && (
        <div
          id={`${id}-commands`}
          role="listbox"
          aria-label={t("prompt_block")}
          className="fixed z-50 max-h-64 w-64 overflow-auto rounded-xl border border-border bg-background p-1 shadow-lg"
          style={{ left: menu.left, top: menu.top }}
        >
          {menu.items.length ? (
            menu.items.map((command, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === menu.selected}
                id={`${id}-option-${index}`}
                tabIndex={-1}
                key={command.id}
                className="w-full rounded-lg p-3 text-left text-sm aria-selected:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (editor) command.run(editor.chain().focus().deleteRange(menu.range)).run();
                }}
              >
                {command.label}
              </button>
            ))
          ) : (
            <p className="p-3 text-sm">{t("prompt_no_commands")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function updateAccessibility(
  element: HTMLElement,
  disabled: boolean,
  count: number,
  id: string,
  menu: PromptMenu | null,
) {
  element.setAttribute("aria-readonly", String(disabled));
  element.setAttribute("aria-invalid", String(count > instructionLimit));
  element.setAttribute("aria-describedby", `${id}-hint`);
  if (menu && !disabled && menu.items.length) {
    element.setAttribute("aria-controls", `${id}-commands`);
    element.setAttribute("aria-activedescendant", `${id}-option-${menu.selected}`);
  } else {
    element.removeAttribute("aria-controls");
    element.removeAttribute("aria-activedescendant");
  }
}

function PromptToolbar({
  editor,
  commands,
  disabled,
}: {
  editor: Editor | null;
  commands: PromptCommand[];
  disabled: boolean;
}) {
  const { t } = useI18n();
  const state = useEditorState({
    editor,
    selector: ({ editor: target }) => ({
      bold: target?.isActive("bold") ?? false,
      italic: target?.isActive("italic") ?? false,
      undo: target?.can().undo() ?? false,
      redo: target?.can().redo() ?? false,
      block: target?.isActive("bulletList")
        ? "bulletList"
        : target?.isActive("orderedList")
          ? "orderedList"
          : [1, 2, 3].find((level) => target?.isActive("heading", { level }))
            ? `heading-${target?.getAttributes("heading").level}`
            : "paragraph",
    }),
  });
  return (
    <div
      role="toolbar"
      aria-label={t("prompt_toolbar")}
      className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-2"
    >
      <NativeSelect
        aria-label={t("prompt_block")}
        className="h-11 w-36 text-sm"
        disabled={disabled || !editor}
        value={state?.block ?? "paragraph"}
        onChange={(event) => {
          const command = commands.find((item) => item.id === event.target.value);
          if (editor && command) command.run(editor.chain().focus()).run();
        }}
      >
        {commands.map((command) => (
          <option key={command.id} value={command.id}>
            {command.label}
          </option>
        ))}
      </NativeSelect>
      <Button
        type="button"
        variant="ghost"
        aria-label={t("prompt_bold")}
        aria-pressed={state?.bold}
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={t("prompt_italic")}
        aria-pressed={state?.italic}
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={t("prompt_undo")}
        disabled={disabled || !state?.undo}
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <Undo2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={t("prompt_redo")}
        disabled={disabled || !state?.redo}
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <Redo2 />
      </Button>
    </div>
  );
}
