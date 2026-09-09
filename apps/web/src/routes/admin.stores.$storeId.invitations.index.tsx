import { createFileRoute } from "@tanstack/react-router";
import { Invitations } from "../features/store/invitations";
export const Route = createFileRoute("/admin/stores/$storeId/invitations/")({
  component: Invitations,
});
