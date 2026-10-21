import { createFileRoute } from "@tanstack/react-router";
import { InviteMember } from "../features/store/invitations";
import { membershipOptions } from "../features/store/membership-query";
import { storesOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId/invitations/new")({
  staticData: { document: { title: "org_invite", description: "head_invite_description" } },
  loader: async ({ context, params }) => {
    const stores = await context.queryClient.ensureQueryData(storesOptions);
    const store = stores.stores.find((item) => item.id === params.storeId);
    if (store) await context.queryClient.ensureQueryData(membershipOptions(store.organizationId));
  },
  component: InviteMember,
});
