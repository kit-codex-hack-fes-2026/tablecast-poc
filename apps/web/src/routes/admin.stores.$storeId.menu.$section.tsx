import { createFileRoute } from "@tanstack/react-router";
import { catalogOptions } from "../features/catalog/catalog-query";
import { MenuCollection } from "../features/catalog/menu-collection";
import {
  menuLabels,
  menuListSearchSchema,
  menuSectionSchema,
} from "../features/configuration/menu-model";
import { standardVoicesOptions } from "../features/configuration/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/$section")({
  staticData: { document: { title: "admin_config", description: "head_catalog_description" } },
  validateSearch: menuListSearchSchema,
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
      ...(params.section === "cast"
        ? (["ja", "en"] as const).map((language) =>
            context.queryClient.prefetchInfiniteQuery(
              standardVoicesOptions(params.storeId, language),
            ),
          )
        : []),
    ]);
    return { document: { title: menuLabels[params.section] } };
  },
  pendingComponent: () => <Page />,
  component: () => <Page />,
});
function Page() {
  const search = Route.useSearch();
  const { section } = Route.useParams();
  return <MenuCollection search={search} section={section} />;
}
