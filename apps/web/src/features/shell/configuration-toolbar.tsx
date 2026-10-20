import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 入力とmutationは各編集画面が所有し、同じ操作をシェルの所定位置へ描画する。
const ToolbarContext = createContext<{
  status: HTMLElement | null;
  actions: HTMLElement | null;
  setStatus: (element: HTMLDivElement | null) => void;
  setActions: (element: HTMLDivElement | null) => void;
} | null>(null);
export function ConfigurationToolbarProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ status, actions, setStatus, setActions }), [status, actions]);
  return <ToolbarContext value={value}>{children}</ToolbarContext>;
}
export function ConfigurationToolbarHost({ reserve = false }: { reserve?: boolean }) {
  const context = useContext(ToolbarContext);
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center justify-between gap-3 ${reserve ? "min-h-12" : ""}`}
    >
      <div ref={context?.setStatus} className="min-w-0 empty:hidden" />
      <div ref={context?.setActions} className="flex min-w-0 flex-wrap gap-2 empty:hidden" />
    </div>
  );
}
export function ConfigurationToolbar({
  children,
  slot = "actions",
}: {
  children: ReactNode;
  slot?: "status" | "actions";
}) {
  const context = useContext(ToolbarContext);
  if (!context) return children;
  const target = context[slot];
  return target ? createPortal(children, target) : null;
}
