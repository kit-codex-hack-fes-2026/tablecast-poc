import { createFileRoute } from "@tanstack/react-router";
import { SettingsDrafts } from "../features/admin/settings-drafts";
import { draftsOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(draftsOptions(params.storeId));
  },
  component: SettingsDrafts,
});
