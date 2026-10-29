import type { StoreSkill } from "@tablecast/api/schema";
import { resolveSkillReference, skillFrontmatter } from "@tablecast/api/store-knowledge-files";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import {
  EditorContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  CodeXml,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { KnowledgeImageDialog } from "./store-knowledge-image-dialog";
import { KnowledgeImage } from "./store-knowledge-preview";

type KnowledgeFile = StoreSkill["files"][number];
type ImageFile = Extract<KnowledgeFile, { imageKey: string }>;
const ImageContext = createContext<null | { path: string; skill: StoreSkill }>(null);
function EditorImage({ node }: NodeViewProps) {
  const context = useContext(ImageContext);
  const { src, alt } = z
    .object({ src: z.string(), alt: z.string().nullable().optional() })
    .parse(node.attrs);
  const path = context && resolveSkillReference(context.path, src);
  const file = context?.skill.files.find((item) => item.path === path);
  return (
    <NodeViewWrapper as="span" className="block">
      <KnowledgeImage
        alt={alt ?? ""}
        imageKey={file && "imageKey" in file ? file.imageKey : undefined}
        src={/^https:\/\//i.test(src) ? src : undefined}
      />
    </NodeViewWrapper>
  );
}
const SkillImage = Image.extend({ addNodeView: () => ReactNodeViewRenderer(EditorImage) });
const extensions = [
  StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
  Markdown,
  SkillImage,
  TableKit.configure({ table: { resizable: false } }),
  TaskList,
  TaskItem.configure({ nested: true }),
];
function relativePath(from: string, to: string) {
  const base = from.split("/").slice(0, -1),
    parts = to.split("/");
  while (base.length && parts.length && base[0] === parts[0]) {
    base.shift();
    parts.shift();
  }
  return [...base.map(() => ".."), ...parts].join("/");
}

export function KnowledgeMarkdownEditor({
  value,
  path,
  skill,
  storeId,
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (content: string, image?: ImageFile) => void;
  path: string;
  skill: StoreSkill;
  storeId: string;
  value: string;
}) {
  const { t } = useI18n();
  const parts = skillFrontmatter(value);
  const lastEmitted = useRef<string>(undefined);
  const [imageDialog, setImageDialog] = useState(false);
  const [link, setLink] = useState<null | string>(null);
  const pendingImage = useRef<ImageFile>(undefined);
  const context = useMemo(() => ({ path, skill }), [path, skill]);
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    content: parts.body,
    contentType: "markdown",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": t("knowledge_visual_body"),
        "aria-multiline": "true",
        class:
          "min-h-64 min-w-0 space-y-2 p-3 text-base leading-7 outline-none wrap-anywhere [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:p-3 [&_pre]:font-mono [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_table]:w-full [&_th]:border [&_th]:p-2 [&_td]:border [&_td]:p-2 [&_a]:text-info-text [&_a]:underline [&_ul[data-type=taskList]]:list-none [&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:gap-2",
      },
    },
    onUpdate: ({ editor: current }) => {
      const body = current.getMarkdown();
      lastEmitted.current = body;
      onChange(`${parts.header}${body}`, pendingImage.current);
      pendingImage.current = undefined;
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);
  useEffect(() => {
    if (editor && lastEmitted.current !== parts.body && editor.getMarkdown() !== parts.body) {
      editor.commands.setContent(parts.body, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, parts.body]);
  if (!editor) return <div className="min-h-64 rounded-md border border-border" />;
  const tools = [
    {
      icon: Heading2,
      label: t("knowledge_heading2"),
      active: editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      icon: Heading3,
      label: t("knowledge_heading3"),
      active: editor.isActive("heading", { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      icon: Bold,
      label: t("knowledge_bold"),
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      icon: Italic,
      label: t("knowledge_italic"),
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      icon: Strikethrough,
      label: t("knowledge_strike"),
      active: editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      icon: List,
      label: t("knowledge_bullet_list"),
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      icon: ListOrdered,
      label: t("knowledge_ordered_list"),
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      icon: ListTodo,
      label: t("knowledge_task_list"),
      active: editor.isActive("taskList"),
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      icon: Quote,
      label: t("knowledge_quote"),
      active: editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      icon: Code,
      label: t("knowledge_inline_code"),
      active: editor.isActive("code"),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      icon: CodeXml,
      label: t("knowledge_code_block"),
      active: editor.isActive("codeBlock"),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      icon: Table2,
      label: t("knowledge_table"),
      run: () =>
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      icon: Link2,
      label: t("knowledge_link"),
      active: editor.isActive("link"),
      run: () => setLink(""),
    },
    { icon: ImagePlus, label: t("knowledge_add_image"), run: () => setImageDialog(true) },
    { icon: Undo2, label: t("knowledge_undo"), run: () => editor.chain().focus().undo().run() },
    { icon: Redo2, label: t("knowledge_redo"), run: () => editor.chain().focus().redo().run() },
  ];
  return (
    <ImageContext.Provider value={context}>
      <div className="space-y-2">
        {parts.header && (
          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              {t("knowledge_frontmatter")}
            </summary>
            <textarea
              aria-label={t("knowledge_frontmatter")}
              disabled={disabled}
              value={parts.yaml}
              onChange={(event) => onChange(`---\n${event.target.value}\n---\n${parts.body}`)}
              className="mt-2 min-h-28 w-full rounded-md border border-input p-2 font-mono text-sm"
              spellCheck={false}
            />
          </details>
        )}
        <div className="overflow-hidden rounded-md border border-input bg-background">
          <div
            role="toolbar"
            aria-label={t("knowledge_formatting")}
            className="flex flex-wrap gap-0.5 border-b border-border p-1"
          >
            {tools.map(({ icon: Icon, label, active, run }) => (
              <Button
                type="button"
                key={label}
                variant="ghost"
                size="icon-sm"
                aria-label={label}
                title={label}
                aria-pressed={active}
                disabled={disabled}
                onClick={run}
                className="aria-pressed:bg-info-selected aria-pressed:text-info-text"
              >
                <Icon />
              </Button>
            ))}
          </div>
          <EditorContent editor={editor} />
        </div>
        {imageDialog && (
          <KnowledgeImageDialog
            skill={skill}
            storeId={storeId}
            disabled={disabled}
            onOpenChange={setImageDialog}
            onAdd={(image) => {
              if (!("imageKey" in image)) return;
              pendingImage.current = image;
              editor
                .chain()
                .focus()
                .setImage({ src: relativePath(path, image.path), alt: image.alt })
                .run();
              pendingImage.current = undefined;
              setImageDialog(false);
            }}
          />
        )}
        {link !== null && (
          <Dialog open onOpenChange={() => setLink(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("knowledge_link")}</DialogTitle>
              </DialogHeader>
              <label className="grid gap-2 text-sm">
                {t("knowledge_link_target")}
                <Input value={link} onChange={(event) => setLink(event.target.value)} />
              </label>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={
                    disabled ||
                    !link.trim() ||
                    (!resolveSkillReference(path, link) && !/^https:\/\//i.test(link))
                  }
                  onClick={() => {
                    editor.chain().focus().extendMarkRange("link").setLink({ href: link }).run();
                    setLink(null);
                  }}
                >
                  {t("common_save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </ImageContext.Provider>
  );
}
