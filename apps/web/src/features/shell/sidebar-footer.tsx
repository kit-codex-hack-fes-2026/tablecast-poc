import type { ReactNode } from "react";

export function SidebarFooter({ children }: { children: ReactNode }) {
  return (
    <div data-ui="sidebar-footer" className="flex flex-col gap-2 border-t border-border py-3">
      {children}
    </div>
  );
}
