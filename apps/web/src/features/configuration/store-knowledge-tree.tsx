import type { StoreSkill } from "@tablecast/api/schema";
import { ChevronRight, FileCode2, FileImage, FileText, Folder, FolderOpen } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

export type KnowledgeSelection = { path: string; skillId: string };
type FileNode = { children?: FileNode[]; key: string; name: string; path: string; skillId: string };

function skillTree(skills: StoreSkill[]) {
  return skills.map((skill): FileNode => {
    const root: FileNode = {
      key: skill.id,
      name: skill.id,
      path: "",
      skillId: skill.id,
      children: [],
    };
    for (const file of skill.files) {
      let parent = root;
      const parts = file.path.split("/");
      parts.forEach((name, index) => {
        const path = parts.slice(0, index + 1).join("/");
        let node = parent.children?.find((item) => item.path === path);
        if (!node) {
          node = {
            key: `${skill.id}/${path}`,
            name,
            path,
            skillId: skill.id,
            ...(index < parts.length - 1 ? { children: [] } : {}),
          };
          parent.children?.push(node);
        }
        parent = node;
      });
    }
    return root;
  });
}

function visibleNodes(
  nodes: FileNode[],
  closed: Set<string>,
  level = 1,
  parent?: string,
): (FileNode & { level: number; parent?: string; position: number; siblings: number })[] {
  return nodes.flatMap((node, index) => [
    { ...node, level, parent, position: index + 1, siblings: nodes.length },
    ...(node.children && !closed.has(node.key)
      ? visibleNodes(node.children, closed, level + 1, node.key)
      : []),
  ]);
}

export function StoreKnowledgeTree({
  skills,
  selected,
  onSelect,
}: {
  onSelect: (selection: KnowledgeSelection) => void;
  selected?: KnowledgeSelection;
  skills: StoreSkill[];
}) {
  const { t } = useI18n();
  const [closed, setClosed] = useState(new Set<string>());
  const [focused, setFocused] = useState<string>();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const nodes = visibleNodes(skillTree(skills), closed);
  const selectedKey = selected && `${selected.skillId}/${selected.path}`;
  const active =
    nodes.find((node) => node.key === focused)?.key ??
    nodes.find((node) => node.key === selectedKey)?.key ??
    nodes[0]?.key;
  function toggle(key: string) {
    setClosed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function focus(key?: string) {
    if (!key) return;
    setFocused(key);
    refs.current.get(key)?.focus();
  }
  return (
    <div role="tree" aria-label={t("knowledge_files")} className="min-w-0 py-2">
      {nodes.map((node, index) => {
        const expanded = Boolean(node.children && !closed.has(node.key));
        const Icon = node.children
          ? expanded
            ? FolderOpen
            : Folder
          : /\.(png|jpe?g|webp)$/i.test(node.path)
            ? FileImage
            : /\.(json|ya?ml|[jt]sx?|py|sh|sql)$/i.test(node.path)
              ? FileCode2
              : FileText;
        return (
          <Button
            key={node.key}
            ref={(element) => {
              if (element) refs.current.set(node.key, element);
              else refs.current.delete(node.key);
            }}
            type="button"
            role="treeitem"
            aria-level={node.level}
            aria-posinset={node.position}
            aria-setsize={node.siblings}
            aria-expanded={node.children ? expanded : undefined}
            aria-selected={node.key === selectedKey}
            tabIndex={node.key === active ? 0 : -1}
            variant="ghost"
            size="sm"
            title={node.path || node.skillId}
            style={{ paddingInlineStart: `${(node.level - 1) * 16 + 8}px` }}
            className="h-10 w-full min-w-0 justify-start gap-2 rounded-none pr-3 text-left text-sm shadow-none aria-expanded:bg-transparent aria-selected:bg-control-selected aria-selected:font-semibold aria-selected:text-foreground"
            onFocus={() => setFocused(node.key)}
            onClick={() =>
              node.children
                ? toggle(node.key)
                : onSelect({ skillId: node.skillId, path: node.path })
            }
            onKeyDown={(event) => {
              if (
                ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(
                  event.key,
                )
              )
                event.preventDefault();
              if (event.key === "ArrowDown") focus(nodes[index + 1]?.key);
              if (event.key === "ArrowUp") focus(nodes[index - 1]?.key);
              if (event.key === "Home") focus(nodes[0]?.key);
              if (event.key === "End") focus(nodes.at(-1)?.key);
              if (event.key === "ArrowRight" && node.children) {
                if (!expanded) toggle(node.key);
                else focus(nodes[index + 1]?.key);
              }
              if (event.key === "ArrowLeft") {
                if (expanded) toggle(node.key);
                else focus(node.parent);
              }
            }}
          >
            {node.children ? (
              <ChevronRight
                aria-hidden
                className={`size-3 shrink-0 ${expanded ? "rotate-90" : ""}`}
              />
            ) : (
              <span aria-hidden className="w-3 shrink-0" />
            )}
            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </Button>
        );
      })}
    </div>
  );
}
