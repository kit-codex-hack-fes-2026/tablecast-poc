import type { StoreSummary } from "@tablecast/api/schema";
import { createContext, useContext } from "react";

export const StoreContext = createContext<
  null | (StoreSummary & { logo: null | string; organizationId: string })
>(null);
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("STORE_CONTEXT_REQUIRED");
  return store;
}
