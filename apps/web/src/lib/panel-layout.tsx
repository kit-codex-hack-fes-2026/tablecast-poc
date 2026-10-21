import { createContext, type ReactNode, useContext } from "react";
const PanelCookies = createContext("");
export function PanelLayoutProvider({
  cookies,
  children,
}: {
  children: ReactNode;
  cookies: string;
}) {
  return <PanelCookies.Provider value={cookies}>{children}</PanelCookies.Provider>;
}
export function usePanelCookies() {
  return useContext(PanelCookies);
}
