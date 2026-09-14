import { createFileRoute } from "@tanstack/react-router";
import { SettingsDrafts } from "../features/store/settings-drafts";
import { catalogOptions } from "../features/store/menu-query";
import { draftsOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(draftsOptions(params.storeId)),
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
    ]);
  },
  component: SettingsDrafts,
});
