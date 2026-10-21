import { createFileRoute, redirect } from "@tanstack/react-router";
import { MenuItem } from "../features/store/menu-item";
import {
  menuDocument,
  menuListSearchSchema,
  menuSectionSchema,
} from "../features/store/menu-model";
import { catalogOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/$section_/$itemId")({
  staticData: { document: { title: "admin_config", description: "head_catalog_description" } },
  validateSearch: menuListSearchSchema,
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  beforeLoad: ({ params }) => {
    if (params.section === "cast")
      throw redirect({
        to: "/admin/stores/$storeId/menu/$section",
        params: { storeId: params.storeId, section: "cast" },
      });
  },
  loader: async ({ context, params }) => {
    const catalog = await context.queryClient.ensureQueryData(catalogOptions(params.storeId));
    return { document: menuDocument(catalog.configuration, params.section, params.itemId) };
  },
  component: Page,
});
function Page() {
  const search = Route.useSearch();
  const { section, itemId } = Route.useParams();
  return <MenuItem search={search} section={section} itemId={itemId} />;
}
