import { Collapsible } from "@base-ui/react/collapsible";
import { useHydrated } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { useSidebarPreferences, type NavigationGroupId } from "./sidebar-preferences";

export const navigationItemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-base text-muted-foreground hover:bg-[var(--nav-surface,var(--color-control-hover))] hover:text-[var(--nav-color,var(--color-foreground))] aria-[current=page]:bg-[var(--nav-surface,var(--color-control-selected))] aria-[current=page]:text-[var(--nav-color,var(--color-foreground))] aria-[current=page]:font-semibold data-[status=active]:bg-[var(--nav-surface,var(--color-control-selected))] data-[status=active]:text-[var(--nav-color,var(--color-foreground))] data-[status=active]:font-semibold [&>svg]:shrink-0 [&>svg]:size-5";
const groupStyle = tv({
  base: "min-w-0",
  variants: {
    tone: {
      operations:
        "[--nav-color:var(--color-nav-operations)] [--nav-surface:var(--color-nav-operations-soft)]",
      menu: "[--nav-color:var(--color-nav-menu)] [--nav-surface:var(--color-nav-menu-soft)]",
      rewards:
        "[--nav-color:var(--color-nav-rewards)] [--nav-surface:var(--color-nav-rewards-soft)]",
      store: "[--nav-color:var(--color-nav-store)] [--nav-surface:var(--color-nav-store-soft)]",
      workspace:
        "[--nav-color:var(--color-nav-workspace)] [--nav-surface:var(--color-nav-workspace-soft)]",
    },
  },
});
export function NavigationGroup({
  id,
  label,
  icon: Icon,
  collapsed,
  initialOpen = true,
  userId,
  children,
}: {
  id: NavigationGroupId;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
  initialOpen?: boolean;
  userId?: string;
  children: ReactNode;
}) {
  const { preferences, update } = useSidebarPreferences(userId);
  const hydrated = useHydrated();
  const saved = preferences.groups?.[id];
  const open = saved ?? initialOpen;
  return (
    <section className={groupStyle({ tone: id })} aria-label={label}>
      {collapsed ? (
        <div className="border-t border-border pt-2">{children}</div>
      ) : (
        <Collapsible.Root open={open} onOpenChange={(next) => update({ groups: { [id]: next } })}>
          <h2 className="text-sm">
            <Collapsible.Trigger
              disabled={!hydrated}
              className="group flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left font-semibold text-[var(--nav-color)] hover:bg-[var(--nav-surface)]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--nav-surface)]">
                <Icon className="size-5" />
              </span>
              {label}
              <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-150 group-aria-expanded:rotate-90 motion-reduce:transition-none" />
            </Collapsible.Trigger>
          </h2>
          <Collapsible.Panel>
            <div className="ml-4 border-l border-border pl-2">{children}</div>
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
    </section>
  );
}
