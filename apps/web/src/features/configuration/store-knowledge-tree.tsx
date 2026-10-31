import { type StoreSkill, storeSkillLimits } from "@tablecast/api/schema";
import { ChevronRight, FileCode2, FileImage, FileText, Folder, FolderOpen } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "../../i18n/locale";
import {
  type KnowledgeTreeAction,
  KnowledgeTreeMenu,
  type KnowledgeTreeTarget,
} from "./store-knowledge-menu";

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
  onAction,
  editable = false,
  disabled = false,
}: {
  disabled?: boolean;
  editable?: boolean;
  onAction: (action: KnowledgeTreeAction, target: KnowledgeTreeTarget) => void;
  onSelect: (selection: KnowledgeSelection) => void;
  selected?: KnowledgeSelection;
  skills: StoreSkill[];
}) {
  const { t } = useI18n();
  const selectedKey = selected && `${selected.skillId}/${selected.path}`;
  const [treeState, setTreeState] = useState({ selection: selectedKey, closed: new Set<string>() });
  if (treeState.selection !== selectedKey) {
    const closed = new Set(treeState.closed);
    if (selected) {
      closed.delete(selected.skillId);
      const parts = selected.path.split("/");
      for (let index = 1; index < parts.length; index++)
        closed.delete(`${selected.skillId}/${parts.slice(0, index).join("/")}`);
    }
    setTreeState({ selection: selectedKey, closed });
  }
  const closed = treeState.closed;
  const [focused, setFocused] = useState<string>();
  const refs = useRef(new Map<string, HTMLDivElement>());
  const nodes = visibleNodes(skillTree(skills), closed);
  const active =
    nodes.find((node) => node.key === focused)?.key ??
    nodes.find((node) => node.key === selectedKey)?.key ??
    nodes[0]?.key;
  function toggle(key: string) {
    setTreeState((previous) => {
      const next = new Set(previous.closed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...previous, closed: next };
    });
  }
  function focus(key?: string) {
    if (!key) return;
    setFocused(key);
    refs.current.get(key)?.focus();
  }
  return (
    <div role="tree" aria-label={t("knowledge_files")} className="min-w-0 py-1">
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
          <KnowledgeTreeMenu
            key={node.key}
            target={{
              skillId: node.skillId,
              path: node.path,
              kind: node.level === 1 ? "skill" : node.children ? "folder" : "file",
            }}
            editable={editable}
            disabled={disabled}
            full={
              (skills.find((skill) => skill.id === node.skillId)?.files.length ?? 0) >=
              storeSkillLimits.files
            }
            onAction={onAction}
            onToggle={() => toggle(node.key)}
            onOpenMenu={() => {
              if (!node.children) onSelect({ skillId: node.skillId, path: node.path });
            }}
            elementRef={(element) => {
              if (element) refs.current.set(node.key, element);
              else refs.current.delete(node.key);
            }}
            role="treeitem"
            aria-level={node.level}
            aria-posinset={node.position}
            aria-setsize={node.siblings}
            aria-expanded={node.children ? expanded : undefined}
            aria-selected={node.key === selectedKey}
            tabIndex={node.key === active ? 0 : -1}
            aria-label={node.name}
            title={node.path || node.skillId}
            style={{ paddingInlineStart: `${(node.level - 1) * 20 + 8}px` }}
            className="relative flex h-9 min-h-9 w-full min-w-0 cursor-default items-center gap-1.5 pr-1 text-left text-base leading-6 outline-none select-none hover:bg-control-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-info-border aria-selected:bg-info-soft aria-selected:font-medium aria-selected:text-info-text aria-selected:hover:bg-info-hover pointer-coarse:h-11 pointer-coarse:min-h-11"
            onFocus={(event) => {
              if (event.target === event.currentTarget) setFocused(node.key);
            }}
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
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (node.children) toggle(node.key);
                else onSelect({ skillId: node.skillId, path: node.path });
              }
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
            {Array.from({ length: node.level - 1 }, (_, depth) => (
              <span
                key={node.key
                  .split("/")
                  .slice(0, depth + 1)
                  .join("/")}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 border-l border-border"
                style={{ insetInlineStart: `${depth * 20 + 14}px` }}
              />
            ))}
            {node.children ? (
              <ChevronRight
                aria-hidden
                className={`size-3 shrink-0 ${expanded ? "rotate-90" : ""}`}
              />
            ) : (
              <span aria-hidden className="w-3.5 shrink-0" />
            )}
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </KnowledgeTreeMenu>
        );
      })}
    </div>
  );
}
