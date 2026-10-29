import type { StoreSkill } from "@tablecast/api/schema";
import type { ComponentProps } from "react";
import { ImageOff } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
  defaultRehypePlugins,
  Streamdown,
} from "streamdown";
import { ProductImage } from "../../components/product-image";
import { useI18n } from "../../i18n/locale";

type KnowledgeFile = StoreSkill["files"][number];
const Context = createContext<null | {
  file: KnowledgeFile;
  onOpen: (path: string) => void;
  skill: StoreSkill;
}>(null);

/** URL解決はSkill内に閉じ、外部URLとファイル参照を区別する。 */
function localFile(skill: StoreSkill, from: string, href: string) {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) return undefined;
  try {
    const url = new URL(href, `https://tablecast.invalid/${from}`);
    const path = decodeURIComponent(url.pathname.slice(1));
    return skill.files.find((file) => file.path === path);
  } catch {
    return undefined;
  }
}
function publicHttps(href: string) {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function KnowledgeImage({
  src,
  alt,
  imageKey,
}: {
  alt: string;
  imageKey?: string;
  src?: string;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState<string>();
  const url = imageKey ? `/media/${imageKey}` : publicHttps(src ?? "");
  if (!url || failed === url)
    return (
      <span
        role="status"
        className="my-4 flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
      >
        <ImageOff aria-hidden className="size-4" />
        {alt} · {t("editor_image_load_error")}
      </span>
    );
  return (
    <span className="my-4 block overflow-hidden rounded-lg border border-border bg-muted/20">
      {imageKey ? (
        <ProductImage
          src={url}
          alt={alt}
          natural
          responsive
          width={960}
          height={640}
          sizes="(max-width: 768px) 100vw, 800px"
          className="h-auto max-h-[32rem] w-full object-contain"
          onError={() => setFailed(url)}
        />
      ) : (
        <img
          src={url}
          alt={alt}
          width={960}
          height={640}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-auto max-h-[32rem] w-full object-contain"
          onError={() => setFailed(url)}
        />
      )}
    </span>
  );
}
function MarkdownImage({ src, alt }: ComponentProps<"img">) {
  const context = useContext(Context);
  const href = typeof src === "string" ? src : "";
  const file = context && localFile(context.skill, context.file.path, href);
  return (
    <KnowledgeImage
      alt={alt || (file && "alt" in file ? file.alt : href)}
      imageKey={file && "imageKey" in file ? file.imageKey : undefined}
      src={publicHttps(href)}
    />
  );
}
function MarkdownLink({ href = "", children }: ComponentProps<"a">) {
  const context = useContext(Context);
  const file = context && localFile(context.skill, context.file.path, href);
  if (file)
    return (
      <button
        type="button"
        className="inline cursor-pointer text-primary underline underline-offset-4"
        onClick={() => context?.onOpen(file.path)}
      >
        {children}
      </button>
    );
  const url = publicHttps(href);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-4"
    >
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}
const markdownComponents = { img: MarkdownImage, a: MarkdownLink };
// 相対パスを維持し、リンクと画像の許可は専用rendererで判定する。HTMLは構文解析しない。
const knowledgeRehypePlugins = Object.entries(defaultRehypePlugins)
  .filter(([name]) => name === "sanitize")
  .map(([, plugin]) => plugin);
const languages: Record<string, string> = {
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  sh: "bash",
  sql: "sql",
  csv: "csv",
  txt: "text",
};

export function KnowledgeSource({ content, path }: { content: string; path: string }) {
  const { t } = useI18n();
  const language = languages[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? "text";
  return (
    <CodeBlock
      code={content}
      language={language}
      lineNumbers
      className="min-w-0 overflow-hidden rounded-lg border border-border text-sm"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <CodeBlockHeader language={language} />
        <CodeBlockCopyButton aria-label={t("knowledge_copy")} />
      </div>
    </CodeBlock>
  );
}
export function KnowledgePreview({
  skill,
  file,
  onOpen,
}: {
  file: KnowledgeFile;
  onOpen: (path: string) => void;
  skill: StoreSkill;
}) {
  const { t } = useI18n();
  const context = useMemo(() => ({ skill, file, onOpen }), [skill, file, onOpen]);
  if (!("content" in file))
    return <KnowledgeImage imageKey={file.imageKey} alt={file.alt || file.path} />;
  if (!/\.md$/i.test(file.path)) return <KnowledgeSource content={file.content} path={file.path} />;
  return (
    <Context.Provider value={context}>
      <Streamdown
        mode="static"
        translations={{ copyCode: t("knowledge_copy") }}
        skipHtml
        parseIncompleteMarkdown={false}
        components={markdownComponents}
        rehypePlugins={knowledgeRehypePlugins}
        controls={{ code: { copy: true, download: false }, table: false, mermaid: false }}
        className="min-w-0 space-y-4 wrap-anywhere text-sm leading-7 [&_pre]:overflow-x-auto [&_pre]:text-sm"
      >
        {file.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")}
      </Streamdown>
    </Context.Provider>
  );
}
