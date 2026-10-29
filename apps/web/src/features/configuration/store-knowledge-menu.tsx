import { ContextMenu } from "@base-ui/react/context-menu";
import {
  ChevronRight,
  Eye,
  FileCode2,
  FilePenLine,
  FilePlus2,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

export type KnowledgeTreeTarget = {
  kind: "file" | "folder" | "skill";
  path: string;
  skillId: string;
};
export type KnowledgeTreeAction =
  | "add-image"
  | "create-file"
  | "delete"
  | "edit"
  | "preview"
  | "rename"
  | "source";

/** ポインター・キーボード・行の操作ボタンで同じメニューを開く。 */
export function KnowledgeTreeMenu({
  target,
  editable,
  disabled,
  full,
  onAction,
  onOpenMenu,
  onToggle,
  elementRef,
  children,
  onKeyDown,
  ...props
}: ContextMenu.Trigger.Props & {
  children: ReactNode;
  disabled: boolean;
  editable: boolean;
  elementRef: (element: HTMLDivElement | null) => void;
  full: boolean;
  onAction: (action: KnowledgeTreeAction, target: KnowledgeTreeTarget) => void;
  onOpenMenu: () => void;
  onToggle: () => void;
  target: KnowledgeTreeTarget;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement>();
  const trigger = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(true);
  function prepare() {
    restoreFocus.current = true;
    onOpenMenu();
  }
  function run(action: KnowledgeTreeAction) {
    restoreFocus.current = !["rename", "create-file", "add-image", "delete"].includes(action);
    onAction(action, target);
  }

  return (
    <ContextMenu.Root
      open={open}
      onOpenChange={(next) => {
        if (next) prepare();
        setOpen(next);
      }}
    >
      <ContextMenu.Trigger
        {...props}
        ref={(element) => {
          trigger.current = element;
          elementRef(element);
        }}
        onContextMenu={() => setAnchor(undefined)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            setAnchor(event.currentTarget);
            prepare();
            setOpen(true);
          } else onKeyDown?.(event);
        }}
      >
        {children}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label={`${t("knowledge_actions")}: ${target.path.split("/").at(-1) || target.skillId}`}
          aria-haspopup="menu"
          aria-expanded={open}
          className="ml-auto size-8 min-h-8 min-w-8 shrink-0 rounded-none p-1 text-muted-foreground hover:text-foreground aria-expanded:bg-info-soft aria-expanded:text-info-text pointer-coarse:size-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          onClick={(event) => {
            event.stopPropagation();
            setAnchor(event.currentTarget);
            prepare();
            setOpen(true);
          }}
        >
          <MoreHorizontal />
        </Button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          anchor={anchor}
          align="start"
          sideOffset={4}
          className="z-80 outline-none"
        >
          <ContextMenu.Popup
            aria-label={`${t("knowledge_actions")}: ${target.path || target.skillId}`}
            finalFocus={() => (restoreFocus.current ? trigger.current : false)}
            className="min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
          >
            <KnowledgeMenuItems
              target={target}
              editable={editable}
              disabled={disabled}
              full={full}
              run={run}
              onToggle={onToggle}
              expanded={Boolean(props["aria-expanded"])}
            />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function KnowledgeMenuItems({
  target,
  editable,
  disabled,
  full,
  run,
  onToggle,
  expanded,
}: {
  disabled: boolean;
  editable: boolean;
  expanded: boolean;
  full: boolean;
  onToggle: () => void;
  run: (action: KnowledgeTreeAction) => void;
  target: KnowledgeTreeTarget;
}) {
  const { t } = useI18n();
  const itemClass =
    "flex min-h-9 cursor-default items-center gap-2 rounded-md px-3 text-sm outline-none data-highlighted:bg-info-soft data-highlighted:text-info-text data-disabled:pointer-events-none data-disabled:opacity-50 pointer-coarse:min-h-11 [&_svg]:size-4";
  return (
    <ContextMenu.Group>
      <ContextMenu.GroupLabel className="max-w-72 truncate px-3 py-2 text-sm text-muted-foreground">
        {target.path || target.skillId}
      </ContextMenu.GroupLabel>
      {target.kind !== "file" && (
        <ContextMenu.Item className={itemClass} onClick={onToggle}>
          <ChevronRight />
          {t(expanded ? "knowledge_collapse_folder" : "knowledge_expand_folder")}
        </ContextMenu.Item>
      )}
      {target.kind !== "folder" && (
        <>
          <ContextMenu.Item className={itemClass} onClick={() => run("preview")}>
            <Eye />
            {t("prompt_preview")}
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} onClick={() => run("source")}>
            <FileCode2 />
            {t("knowledge_source")}
          </ContextMenu.Item>
          {editable && (
            <ContextMenu.Item disabled={disabled} className={itemClass} onClick={() => run("edit")}>
              <Pencil />
              {t("knowledge_edit_file")}
            </ContextMenu.Item>
          )}
        </>
      )}
      {editable && (
        <>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item
            disabled={disabled || full}
            className={itemClass}
            onClick={() => run("create-file")}
          >
            <FilePlus2 />
            {t("knowledge_add_file")}
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={disabled || full}
            className={itemClass}
            onClick={() => run("add-image")}
          >
            <ImagePlus />
            {t("knowledge_add_image")}
          </ContextMenu.Item>

          {target.kind !== "folder" && (
            <>
              <ContextMenu.Separator className="my-1 h-px bg-border" />
              <ContextMenu.Item
                disabled={disabled || target.path === "SKILL.md"}
                className={itemClass}
                onClick={() => run("rename")}
              >
                <FilePenLine />
                {t("knowledge_rename")}
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={disabled || target.path === "SKILL.md"}
                className={`${itemClass} text-destructive data-highlighted:bg-destructive-soft data-highlighted:text-destructive`}
                onClick={() => run("delete")}
              >
                <Trash2 />
                {t(target.kind === "skill" ? "knowledge_remove_skill" : "knowledge_remove_file")}
              </ContextMenu.Item>
            </>
          )}
        </>
      )}
    </ContextMenu.Group>
  );
}
