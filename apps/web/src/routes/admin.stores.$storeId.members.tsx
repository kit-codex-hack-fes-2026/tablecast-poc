import { collectionSearchSchema } from "../features/shell/collection-model";
import { createFileRoute } from "@tanstack/react-router";
import { Members } from "../features/store/members";
import { membershipOptions } from "../features/store/membership-query";
import { storesOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId/members")({
  validateSearch: collectionSearchSchema,
  staticData: { document: { title: "org_members", description: "head_members_description" } },
  loader: async ({ context, params }) => {
    const stores = await context.queryClient.ensureQueryData(storesOptions);
    const store = stores.stores.find((item) => item.id === params.storeId);
    if (store) await context.queryClient.ensureQueryData(membershipOptions(store.organizationId));
  },
  component: Members,
});
