import { createContext, useContext, type ReactNode } from "react";
const PanelCookies = createContext("");
export function PanelLayoutProvider({
  cookies,
  children,
}: {
  cookies: string;
  children: ReactNode;
}) {
  return <PanelCookies.Provider value={cookies}>{children}</PanelCookies.Provider>;
}
export function usePanelCookies() {
  return useContext(PanelCookies);
}
