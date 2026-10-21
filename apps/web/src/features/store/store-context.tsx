import { createContext, useContext } from "react";

export const StoreContext = createContext<null | {
  id: string;
  logo: null | string;
  name: string;
  organizationId: string;
  role: string;
}>(null);
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("STORE_CONTEXT_REQUIRED");
  return store;
}
