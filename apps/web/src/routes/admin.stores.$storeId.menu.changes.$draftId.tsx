import { createFileRoute } from "@tanstack/react-router";
import { DraftPage } from "../features/admin/settings-drafts";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/$draftId")({
  component: Page,
});
function Page() {
  const { draftId } = Route.useParams();
  return <DraftPage draftId={draftId} />;
}
