import { Tooltip } from "@base-ui/react/tooltip";
import { createLink, type LinkComponent } from "@tanstack/react-router";
import { type ComponentProps, forwardRef, type ReactElement } from "react";
import { cn } from "tailwind-variants";
import { surfaceMotion } from "../../components/ui/motion-variants";
import { navigationItemClass } from "./navigation-group";

/** 縮小表示でもリンクと選択操作の名前をhover・キーボードで確認できる。 */
export function SidebarTooltip({
  label,
  collapsed,
  children,
}: {
  children: ReactElement;
  collapsed: boolean;
  label: string;
}) {
  return (
    <Tooltip.Root disabled={!collapsed}>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={12} className="z-50">
          <Tooltip.Popup
            className={cn(
              "max-w-64 rounded-xl border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-surface",
              surfaceMotion(),
            )}
          >
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const NavigationAnchor = forwardRef<
  HTMLAnchorElement,
  ComponentProps<"a"> & { collapsed?: boolean }
>(function NavigationAnchor(
  { collapsed = false, title, className = navigationItemClass, children, ...props },
  ref,
) {
  return (
    <SidebarTooltip label={title ?? ""} collapsed={collapsed}>
      <a
        {...props}
        ref={ref}
        className={className}
        data-collapsed={collapsed}
        aria-label={props["aria-label"] ?? title}
      >
        {children}
        {props["aria-current"] === "page" && (
          <span
            aria-hidden
            data-slot="navigation-selection"
            className="pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-full bg-(--nav-color,var(--color-foreground))"
          />
        )}
      </a>
    </SidebarTooltip>
  );
});

const RouterNavigationLink = createLink(NavigationAnchor);
export const NavigationLink: LinkComponent<typeof NavigationAnchor> = (props) => (
  <RouterNavigationLink {...props} />
);
