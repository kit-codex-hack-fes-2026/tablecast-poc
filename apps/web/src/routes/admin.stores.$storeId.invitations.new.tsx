import { createFileRoute } from "@tanstack/react-router";
import { InviteMember } from "../features/store/invitations";
export const Route = createFileRoute("/admin/stores/$storeId/invitations/new")({
  component: InviteMember,
});
