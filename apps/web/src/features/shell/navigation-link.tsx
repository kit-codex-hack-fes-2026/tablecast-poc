import { Tooltip } from "@base-ui/react/tooltip";
import { createLink, type LinkComponent } from "@tanstack/react-router";
import type { ComponentProps, ReactElement } from "react";
import { navigationItemClass } from "./navigation-group";

/** 縮小表示でもリンクと選択操作の名前をhover・キーボードで確認できる。 */
export function SidebarTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactElement;
}) {
  return (
    <Tooltip.Root disabled={!collapsed}>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={12} className="z-50">
          <Tooltip.Popup className="max-w-64 rounded-xl border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-surface">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function NavigationAnchor({
  collapsed = false,
  title,
  className = navigationItemClass,
  ...props
}: ComponentProps<"a"> & { collapsed?: boolean }) {
  return (
    <SidebarTooltip label={title ?? ""} collapsed={collapsed}>
      <a
        {...props}
        className={className}
        data-collapsed={collapsed}
        aria-label={props["aria-label"] ?? title}
      />
    </SidebarTooltip>
  );
}

const RouterNavigationLink = createLink(NavigationAnchor);
export const NavigationLink: LinkComponent<typeof NavigationAnchor> = (props) => (
  <RouterNavigationLink {...props} />
);
