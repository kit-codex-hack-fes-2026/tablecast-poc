import { createFileRoute, redirect } from "@tanstack/react-router";
import { catalogOptions } from "../features/catalog/catalog-query";
import { MenuItem } from "../features/catalog/menu-item";
import {
  menuDocument,
  menuListSearchSchema,
  menuSectionSchema,
} from "../features/configuration/menu-model";
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
