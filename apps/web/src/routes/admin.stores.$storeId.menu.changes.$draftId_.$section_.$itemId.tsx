import { createFileRoute } from "@tanstack/react-router";
import { MenuItem } from "../features/store/menu-item";
import { menuSectionSchema } from "../features/store/menu-model";
import { draftOptions } from "../features/store/menu-query";
export const Route = createFileRoute(
  "/admin/stores/$storeId/menu/changes/$draftId_/$section_/$itemId",
)({
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(draftOptions(params.storeId, params.draftId));
  },
  component: Page,
});
function Page() {
  const { section, draftId, itemId } = Route.useParams();
  return <MenuItem section={section} draftId={draftId} itemId={itemId} />;
}
