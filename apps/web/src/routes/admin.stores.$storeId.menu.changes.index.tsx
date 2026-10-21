import { createFileRoute } from "@tanstack/react-router";
import { catalogOptions } from "../features/catalog/catalog-query";
import { draftsOptions } from "../features/configuration/drafts-query";
import { SettingsDrafts } from "../features/configuration/settings-drafts";
import { collectionSearchSchema } from "../features/shell/collection-model";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/")({
  validateSearch: collectionSearchSchema,
  staticData: { document: { title: "admin_drafts", description: "head_review_description" } },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(draftsOptions(params.storeId)),
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
    ]);
  },
  component: SettingsDrafts,
});
