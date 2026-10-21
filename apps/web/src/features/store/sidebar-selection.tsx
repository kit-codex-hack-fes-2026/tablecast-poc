import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { AdminSidebarProps } from "../shell/admin-sidebar";
import { authClient, authResult } from "../../lib/auth-client";
import { sessionOptions } from "../../lib/session-query";
import { useSidebarPreferences } from "../shell/sidebar-preferences";
import { storesOptions } from "../store/store-query";

export function useSidebarStore({
  storeId,
  organizationId,
  tab,
}: Pick<AdminSidebarProps, "organizationId" | "storeId" | "tab">) {
  const session = useQuery(sessionOptions);
  const stores = useQuery({ ...storesOptions, enabled: !!session.data });
  const availableStores = stores.data?.stores ?? [];
  const { preferences, update } = useSidebarPreferences(session.data?.user.id);
  const activeOrganization = organizationId ?? session.data?.session?.activeOrganizationId;
  const remembered = availableStores.find((store) => store.id === preferences.storeId);
  const selected =
    availableStores.find((store) => store.id === storeId) ??
    (organizationId
      ? availableStores.find((store) => store.organizationId === organizationId)
      : (remembered ??
        availableStores.find((store) => store.organizationId === activeOrganization)));
  const selectedStore = storeId ?? selected?.id;
  const selectedOrganization =
    organizationId ?? selected?.organizationId ?? activeOrganization ?? undefined;
  const client = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    if (selected && preferences.storeId !== selected.id) update({ storeId: selected.id });
  }, [selected, preferences.storeId, update]);
  const change = useMutation({
    mutationFn: async (id: string) => {
      const next = availableStores.find((store) => store.id === id);
      if (!next) throw new Error("STORE_NOT_FOUND");
      authResult(await authClient.organization.setActive({ organizationId: next.organizationId }));
      return next;
    },
    onSuccess: async (next) => {
      update({ storeId: next.id });
      client.setQueryData(sessionOptions.queryKey, (current) => {
        if (!current) return current;
        const updated = structuredClone(current);
        updated.session.activeOrganizationId = next.organizationId;
        return updated;
      });
      await client.invalidateQueries({ queryKey: ["tablecast-membership"] });
      await navigate(
        tab === "billing"
          ? { to: "/billing/$organizationId", params: { organizationId: next.organizationId } }
          : { to: "/admin/stores/$storeId", params: { storeId: next.id } },
      );
    },
  });

  return {
    user: session.data?.user,
    pending: stores.isPending || change.isPending,
    error: stores.error ?? change.error,
    availableStores,
    selectedStore,
    selectedOrganization,
    onChange: (id: string, onSuccess?: () => void) => change.mutate(id, { onSuccess }),
    manager: ["owner", "admin"].includes(selected?.role ?? ""),
  };
}
