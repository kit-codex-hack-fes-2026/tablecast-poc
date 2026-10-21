import { createFileRoute } from "@tanstack/react-router";
import { MenuCollection } from "../features/store/menu-collection";
import { menuLabels, menuListSearchSchema, menuSectionSchema } from "../features/store/menu-model";
import { catalogOptions, standardVoicesOptions } from "../features/store/menu-query";
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
