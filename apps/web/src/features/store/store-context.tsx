import { createContext, useContext } from "react";

export const StoreContext = createContext<{
  id: string;
  name: string;
  logo: string | null;
  role: string;
  organizationId: string;
} | null>(null);
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("STORE_CONTEXT_REQUIRED");
  return store;
}
