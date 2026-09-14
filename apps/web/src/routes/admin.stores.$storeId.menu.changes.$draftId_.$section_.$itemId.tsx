import { createFileRoute } from "@tanstack/react-router";
import { MenuItem } from "../features/store/menu-item";
import { menuListSearchSchema, menuSectionSchema } from "../features/store/menu-model";
import { catalogOptions, draftOptions } from "../features/store/menu-query";
export const Route = createFileRoute(
  "/admin/stores/$storeId/menu/changes/$draftId_/$section_/$itemId",
)({
  validateSearch: menuListSearchSchema,
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(draftOptions(params.storeId, params.draftId)),
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
    ]);
  },
  component: Page,
});
function Page() {
  const search = Route.useSearch();
  const { section, draftId, itemId } = Route.useParams();
  return <MenuItem search={search} section={section} draftId={draftId} itemId={itemId} />;
}
