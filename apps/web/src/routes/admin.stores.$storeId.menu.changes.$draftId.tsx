import { createFileRoute } from "@tanstack/react-router";
import { DraftPage } from "../features/store/settings-drafts";
import { draftOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/$draftId")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(draftOptions(params.storeId, params.draftId));
  },
  component: Page,
});
function Page() {
  const { draftId } = Route.useParams();
  return <DraftPage draftId={draftId} />;
}
