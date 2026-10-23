import { createFileRoute } from "@tanstack/react-router";
import { Invitation } from "../features/account/invitation";
export const Route = createFileRoute("/invitations/$invitationId")({
  staticData: { document: { title: "org_invitation", description: "head_invitation_description" } },
  component: InvitationPage,
});
function InvitationPage() {
  const { invitationId } = Route.useParams();
  return <Invitation id={invitationId} />;
}
