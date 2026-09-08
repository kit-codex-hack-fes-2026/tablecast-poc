import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Invitation } from "../features/account/invitation";
export const Route = createFileRoute("/invitations/$invitationId")({
  component: () => (
    <ClientOnly>
      <Invitation id={Route.useParams().invitationId} />
    </ClientOnly>
  ),
});
