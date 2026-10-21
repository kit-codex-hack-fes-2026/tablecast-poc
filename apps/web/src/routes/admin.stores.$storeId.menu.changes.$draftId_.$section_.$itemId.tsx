import { createFileRoute } from "@tanstack/react-router";
import { MenuItem } from "../features/store/menu-item";
import {
  menuDocument,
  menuListSearchSchema,
  menuSectionSchema,
} from "../features/store/menu-model";
import { catalogOptions, draftOptions } from "../features/store/menu-query";
export const Route = createFileRoute(
  "/admin/stores/$storeId/menu/changes/$draftId_/$section_/$itemId",
)({
  staticData: { document: { title: "admin_config", description: "head_catalog_description" } },
  validateSearch: menuListSearchSchema,
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    const [draft] = await Promise.all([
      context.queryClient.ensureQueryData(draftOptions(params.storeId, params.draftId)),
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
    ]);
    return { document: menuDocument(draft.configuration, params.section, params.itemId) };
  },
  component: Page,
});
function Page() {
  const search = Route.useSearch();
  const { section, draftId, itemId } = Route.useParams();
  return <MenuItem search={search} section={section} draftId={draftId} itemId={itemId} />;
}
