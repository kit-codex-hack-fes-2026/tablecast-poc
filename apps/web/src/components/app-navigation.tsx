import type { ReactNode } from "react";
import { PanelLeft, X } from "lucide-react";
import { useI18n } from "../i18n/locale";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

/** シェルの状態は呼出し側で持ち、開閉操作の表示を共通にする。 */
export function NavigationToggle({
  expanded,
  controls,
  shortcut = false,
  className,
  onClick,
}: {
  className?: string;
  controls: string;
  expanded: boolean;
  onClick: () => void;
  shortcut?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Button
      data-ui="navigation-toggle"
      size="icon"
      variant="ghost"
      className={className}
      aria-label={t("admin_navigation")}
      aria-expanded={expanded}
      aria-controls={controls}
      title={shortcut ? `${t("admin_navigation")} (⌘/Ctrl+B)` : undefined}
      aria-keyshortcuts={shortcut ? "Control+B Meta+B" : undefined}
      onClick={onClick}
    >
      <PanelLeft />
    </Button>
  );
}

export function NavigationDrawer({
  open,
  onOpenChange,
  id,
  children,
}: {
  children: ReactNode;
  id: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id={id} side="left" className="relative max-w-72 p-3">
        <DialogTitle className="sr-only">{t("admin_navigation")}</DialogTitle>
        <Button
          className="absolute right-2 top-3"
          size="icon"
          variant="ghost"
          aria-label={t("common_close")}
          onClick={() => onOpenChange(false)}
        >
          <X />
        </Button>
        {children}
      </DialogContent>
    </Dialog>
  );
}
