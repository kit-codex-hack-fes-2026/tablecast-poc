import { createFileRoute } from "@tanstack/react-router";
import { collectionSearchSchema } from "../features/shell/collection-model";
import { Invitations } from "../features/store/invitations";
import { membershipOptions } from "../features/store/membership-query";
export const Route = createFileRoute("/admin/stores/$storeId/invitations/")({
  validateSearch: collectionSearchSchema,
  staticData: {
    document: { title: "invitations_title", description: "head_invitations_description" },
  },
  loader: async ({ context }) => {
    const { store } = context;
    if (store) await context.queryClient.ensureQueryData(membershipOptions(store.organizationId));
  },
  component: Invitations,
});
