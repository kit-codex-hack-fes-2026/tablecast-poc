import { instructionDocumentSchema } from "@tablecast/api/schema";
import { Extension, type ChainedCommands, type Range } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Suggestion } from "@tiptap/suggestion";
import { Plugin } from "@tiptap/pm/state";

export type PromptCommand = {
  id: string;
  label: string;
  search: string;
  run: (chain: ChainedCommands) => ChainedCommands;
};
export type PromptMenu = {
  range: Range;
  items: PromptCommand[];
  selected: number;
  left: number;
  top: number;
};
export function promptExtensions(callbacks: {
  commands: PromptCommand[];
  menu: (menu: PromptMenu | null) => void;
  invalid: () => void;
}) {
  let menu: PromptMenu | null = null;
  let commands = callbacks.commands;
  const extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      strike: false,
      underline: false,
      trailingNode: false,
    }),
    Extension.create({
      name: "tablecastInstructions",
      addProseMirrorPlugins() {
        return [
          new Plugin({
            filterTransaction: (transaction) => {
              if (!transaction.docChanged) return true;
              if (!this.editor.isEditable) return false;
              const valid = instructionDocumentSchema.safeParse(transaction.doc.toJSON()).success;
              if (!valid) queueMicrotask(callbacks.invalid);
              return valid;
            },
          }),
          Suggestion<PromptCommand, PromptCommand>({
            editor: this.editor,
            char: "/",
            startOfLine: true,
            allow: ({ state }) =>
              state.selection.$from.parent.type.name === "paragraph" && this.editor.isEditable,
            items: ({ query }) =>
              commands.filter((command) =>
                `${command.label} ${command.search}`.toLowerCase().includes(query.toLowerCase()),
              ),
            command: ({ editor, range, props }) => {
              props.run(editor.chain().focus().deleteRange(range)).run();
            },
            render: () => ({
              onStart(props) {
                const rect = props.clientRect?.();
                menu = {
                  range: props.range,
                  items: props.items,
                  selected: 0,
                  left: Math.max(8, Math.min(rect?.left ?? 8, window.innerWidth - 280)),
                  top: Math.max(8, Math.min(rect?.bottom ?? 8, window.innerHeight - 280)),
                };
                callbacks.menu(menu);
              },
              onUpdate(props) {
                menu = menu
                  ? { ...menu, range: props.range, items: props.items, selected: 0 }
                  : null;
                callbacks.menu(menu);
              },
              onExit() {
                menu = null;
                callbacks.menu(null);
              },
              onKeyDown: ({ event, view, range }) => {
                if (event.isComposing || view.composing || !menu) return false;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  menu = {
                    ...menu,
                    selected:
                      (menu.selected + (event.key === "ArrowDown" ? 1 : menu.items.length - 1)) %
                      Math.max(menu.items.length, 1),
                  };
                  callbacks.menu(menu);
                  return true;
                }
                if (event.key === "Enter") {
                  const item = menu.items[menu.selected];
                  if (item) item.run(this.editor.chain().focus().deleteRange(range)).run();
                  return true;
                }
                return event.key === "Escape";
              },
            }),
          }),
        ];
      },
    }),
  ];
  return {
    extensions,
    setCommands: (next: PromptCommand[]) => {
      commands = next;
    },
  };
}
