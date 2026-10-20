import { Collapsible } from "@base-ui/react/collapsible";
import { useHydrated } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { useSidebarPreferences, type NavigationGroupId } from "./sidebar-preferences";

export const navigationItemClass =
  "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground aria-[current=page]:bg-[var(--nav-surface,var(--color-info-soft))] aria-[current=page]:text-[var(--nav-color,var(--color-info))] aria-[current=page]:font-semibold data-[status=active]:bg-[var(--nav-surface,var(--color-info-soft))] data-[status=active]:text-[var(--nav-color,var(--color-info))] data-[status=active]:font-semibold [&>svg]:shrink-0 [&>svg]:text-[var(--nav-color,var(--color-info))]";
const groupStyle = tv({
  base: "min-w-0",
  variants: {
    tone: {
      operations: "[--nav-color:var(--color-blue-700)] [--nav-surface:var(--color-blue-50)]",
      menu: "[--nav-color:var(--color-violet-700)] [--nav-surface:var(--color-violet-50)]",
      rewards: "[--nav-color:var(--color-rose-700)] [--nav-surface:var(--color-rose-50)]",
      store: "[--nav-color:var(--color-teal-700)] [--nav-surface:var(--color-teal-50)]",
      workspace: "[--nav-color:var(--color-sky-700)] [--nav-surface:var(--color-sky-50)]",
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
          <h2 className="text-xs">
            <Collapsible.Trigger
              disabled={!hydrated}
              className="group flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left font-semibold text-[var(--nav-color)] hover:bg-[var(--nav-surface)]"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--nav-surface)]">
                <Icon className="size-4" />
              </span>
              {label}
              <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-150 group-aria-expanded:rotate-90 motion-reduce:transition-none" />
            </Collapsible.Trigger>
          </h2>
          <Collapsible.Panel>
            <div className="ml-5 border-l border-border pl-3">{children}</div>
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
    </section>
  );
}
