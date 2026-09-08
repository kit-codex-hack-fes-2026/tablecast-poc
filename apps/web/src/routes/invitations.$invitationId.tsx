import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Invitation } from "../features/account/invitation";
export const Route = createFileRoute("/invitations/$invitationId")({ component: InvitationPage });
function InvitationPage() {
  const { invitationId } = Route.useParams();
  return (
    <ClientOnly>
      <Invitation id={invitationId} />
    </ClientOnly>
  );
}
