import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Admin } from "../features/admin/admin";

export const Route = createFileRoute("/admin/live")({
  validateSearch: z.object({
    section: z.enum(["live", "history", "settings"]).optional(),
    storeId: z.string().optional().catch(undefined),
    draftId: z.string().optional().catch(undefined),
  }),
  component: AdminRoute,
});

function AdminRoute() {
  const { storeId, draftId, section } = Route.useSearch();
  return <Admin key={JSON.stringify([storeId, draftId, section])} />;
}
