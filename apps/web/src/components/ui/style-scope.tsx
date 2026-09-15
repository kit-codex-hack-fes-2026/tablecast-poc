import { createContext, useContext, type ReactNode } from "react";
const ScopeContext = createContext<{ id: string; css: string } | null>(null);
export function StyleScopeProvider({
  value,
  children,
}: {
  value: { id: string; css: string } | null;
  children: ReactNode;
}) {
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
// Portal内にも同じ変数とスタイルの適用範囲を引き継ぐ。
export function StyleScopeBoundary({ children }: { children: ReactNode }) {
  const scope = useContext(ScopeContext);
  if (!scope) return children;
  return (
    <div data-tablecast-theme={scope.id} className="contents">
      <style>{scope.css}</style>
      {children}
    </div>
  );
}
