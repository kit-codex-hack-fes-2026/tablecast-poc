import type { ReactNode } from "react";
import { useHighlightQuery } from "fumadocs-core/search/client";
import { toJsx } from "fumadocs-core/utils/hast-to-jsx";
import { searchHighlightTerms, type SearchLocale } from "../../lib/search-analysis";

function Children({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
function Hidden() {
  return null;
}
function Cell({ children }: { children?: ReactNode }) {
  return (
    <span>
      {children}
      <span aria-hidden="true"> · </span>
    </span>
  );
}
const inlineComponents = {
  strong: ({ children }: { children?: ReactNode }) => <strong>{children}</strong>,
  em: ({ children }: { children?: ReactNode }) => <em>{children}</em>,
  del: ({ children }: { children?: ReactNode }) => <del>{children}</del>,
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-sm bg-muted px-1 font-mono text-[0.9em]">{children}</code>
  ),
  th: Cell,
  td: Cell,
};
// 検索候補全体がリンクのため、埋込・HTMLの属性・内側のリンクは描画しない。
function renderMarkdown(tree: Parameters<typeof toJsx>[0]) {
  const tags = new Set<string>();
  const collect = (node: Parameters<typeof toJsx>[0]) => {
    if (node.type === "element") tags.add(node.tagName);
    if ("children" in node) for (const child of node.children) collect(child);
  };
  collect(tree);
  const hidden = new Set([
    "script",
    "style",
    "iframe",
    "img",
    "svg",
    "object",
    "embed",
    "input",
    "button",
  ]);
  const components = Object.fromEntries(
    [...tags].map((tag) => [
      tag,
      hidden.has(tag)
        ? Hidden
        : (Object.entries(inlineComponents).find(([name]) => name === tag)?.[1] ?? Children),
    ]),
  );
  return toJsx(tree, { components });
}

export function SearchSnippet({
  text,
  tree,
  query,
  locale,
}: {
  locale: SearchLocale;
  query: string;
  text: string;
  tree?: Parameters<typeof toJsx>[0];
}) {
  const highlight = useHighlightQuery(searchHighlightTerms(query, text, locale));
  return (
    <span ref={highlight} className="wrap-anywhere">
      {tree ? renderMarkdown(tree) : text}
    </span>
  );
}
