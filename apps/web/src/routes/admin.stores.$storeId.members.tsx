import { createFileRoute } from "@tanstack/react-router";
import { collectionSearchSchema } from "../features/shell/collection-model";
import { Members } from "../features/store/members";
import { membershipOptions } from "../features/store/membership-query";
export const Route = createFileRoute("/admin/stores/$storeId/members")({
  validateSearch: collectionSearchSchema,
  staticData: { document: { title: "org_members", description: "head_members_description" } },
  loader: async ({ context }) => {
    const { store } = context;
    if (store) await context.queryClient.ensureQueryData(membershipOptions(store.organizationId));
  },
  component: Members,
});
