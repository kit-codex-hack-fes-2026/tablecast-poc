import { createFileRoute } from "@tanstack/react-router";
import { InviteMember } from "../features/store/invitations";
import { membershipOptions } from "../features/store/membership-query";
export const Route = createFileRoute("/admin/stores/$storeId/invitations/new")({
  staticData: { document: { title: "org_invite", description: "head_invite_description" } },
  loader: async ({ context }) => {
    const { store } = context;
    if (store) await context.queryClient.ensureQueryData(membershipOptions(store.organizationId));
  },
  component: InviteMember,
});
