import { storesOptions } from "../features/store/store-query";
import { sessionOptions } from "../lib/session-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { Admin } from "../features/admin/admin";

export const Route = createFileRoute("/admin/live")({
  validateSearch: z.object({
    section: z.enum(["live", "history", "settings"]).optional(),
    storeId: z.string().optional().catch(undefined),
    draftId: z.string().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const stores = await context.queryClient.ensureQueryData(storesOptions);
    const session = await context.queryClient.ensureQueryData(sessionOptions);
    const store =
      stores.stores.find((item) => item.id === deps.storeId) ??
      stores.stores.find((item) => item.organizationId === session?.session.activeOrganizationId) ??
      stores.stores[0];
    if (!store) return;
    if (deps.draftId)
      throw redirect({
        to: "/admin/stores/$storeId/menu/changes/$draftId",
        params: { storeId: store.id, draftId: deps.draftId },
      });
    if (deps.section === "settings")
      throw redirect({
        to: "/admin/stores/$storeId/menu/$section",
        params: { storeId: store.id, section: "products" },
      });
    if (deps.section === "history")
      throw redirect({ to: "/admin/stores/$storeId/visits", params: { storeId: store.id } });
    throw redirect({ to: "/admin/stores/$storeId/floor", params: { storeId: store.id } });
  },
  component: AdminRoute,
});

function AdminRoute() {
  const { storeId, draftId, section } = Route.useSearch();
  return <Admin key={JSON.stringify([storeId, draftId, section])} />;
}
