import { Collapsible } from "@base-ui/react/collapsible";
import { useHydrated } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { cn } from "tailwind-variants";
import { controlMotion, disclosureMotion } from "../../components/ui/motion-variants";
import { navigationGroupStyle } from "./navigation-model";
import { type NavigationGroupId, useSidebarPreferences } from "./sidebar-preferences";

export const navigationItemClass =
  controlMotion +
  " relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-base text-muted-foreground data-[collapsed=true]:justify-center data-[collapsed=true]:px-0 hover:bg-[var(--nav-surface,var(--color-control-hover))] hover:text-[var(--nav-color,var(--color-foreground))] aria-[current=page]:bg-[var(--nav-surface,var(--color-control-selected))] aria-[current=page]:text-[var(--nav-color,var(--color-foreground))] aria-[current=page]:font-semibold data-[status=active]:bg-[var(--nav-surface,var(--color-control-selected))] data-[status=active]:text-[var(--nav-color,var(--color-foreground))] data-[status=active]:font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:shrink-0 [&>svg]:size-5";
export function NavigationGroup({
  id,
  label,
  icon: Icon,
  collapsed,
  userId,
  children,
}: {
  children: ReactNode;
  collapsed: boolean;
  icon: LucideIcon;
  id: NavigationGroupId;
  label: string;
  userId?: string;
}) {
  const { preferences, update } = useSidebarPreferences(userId);
  const hydrated = useHydrated();
  const saved = preferences.groups?.[id];
  const open = saved ?? true;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (collapsed && document.activeElement === trigger.current)
      panel.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
    else if (!collapsed && !open && panel.current?.contains(document.activeElement))
      trigger.current?.focus();
  }, [collapsed, open]);
  return (
    <section
      className={navigationGroupStyle({
        tone: id,
        className: collapsed
          ? "border-t border-border pt-2 first:border-t-0 first:pt-0"
          : undefined,
      })}
      aria-label={label}
    >
      <Collapsible.Root
        open={collapsed || open}
        onOpenChange={(next) => {
          if (!collapsed) update({ groups: { [id]: next } });
        }}
      >
        <h2 className="text-sm" hidden={collapsed}>
          <Collapsible.Trigger
            ref={trigger}
            disabled={!hydrated}
            className={cn(
              controlMotion,
              "group flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left font-semibold text-[var(--nav-color)] hover:bg-[var(--nav-surface)]",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--nav-surface)]">
              <Icon className="size-5" />
            </span>
            {label}
            <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-(--motion-state) ease-(--motion-ease-out) group-aria-expanded:rotate-90 motion-reduce:transition-none" />
          </Collapsible.Trigger>
        </h2>
        <Collapsible.Panel ref={panel} keepMounted className={disclosureMotion}>
          <div className={collapsed ? undefined : "ml-4 border-l border-border pl-2"}>
            {children}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </section>
  );
}
