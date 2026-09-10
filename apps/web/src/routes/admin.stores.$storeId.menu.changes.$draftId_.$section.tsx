import { createFileRoute } from "@tanstack/react-router";
import { MenuCollection } from "../features/store/menu-collection";
import { menuSectionSchema } from "../features/store/menu-model";
import { draftOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/$draftId_/$section")({
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(draftOptions(params.storeId, params.draftId));
  },
  component: Page,
});
function Page() {
  const { section, draftId } = Route.useParams();
  return <MenuCollection section={section} draftId={draftId} />;
}
