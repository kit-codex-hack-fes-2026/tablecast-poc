import { createContext, type ReactNode, useContext } from "react";
const ScopeContext = createContext<null | { css: string; id: string }>(null);
export function StyleScopeProvider({
  value,
  children,
}: {
  children: ReactNode;
  value: null | { css: string; id: string };
}) {
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
// Portal内にも同じ変数とスタイルの適用範囲を引き継ぐ。
/**
 * StoreThemeが生成したスコープをPortalへ引き継ぐ内部部品。
 * Providerのvalueは{id,css}またはnull、Boundaryはchildrenのみ。
 * 外部入力をここへ直接渡さず、schemaを検証するStoreThemeを使う。
 * DialogContent内部で既に使われるため重ねて追加しない。
 */
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
