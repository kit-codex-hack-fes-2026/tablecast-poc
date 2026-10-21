import { createFileRoute } from "@tanstack/react-router";
import { MenuCollection } from "../features/store/menu-collection";
import { menuLabels, menuListSearchSchema, menuSectionSchema } from "../features/store/menu-model";
import { catalogOptions, draftOptions, standardVoicesOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/$draftId_/$section")({
  staticData: { document: { title: "admin_config", description: "head_catalog_description" } },
  validateSearch: menuListSearchSchema,
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    await Promise.all([
      ...(params.section === "cast"
        ? (["ja", "en"] as const).map((language) =>
            context.queryClient.prefetchInfiniteQuery(
              standardVoicesOptions(params.storeId, language),
            ),
          )
        : []),
      context.queryClient.ensureQueryData(draftOptions(params.storeId, params.draftId)),
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
    ]);
    return { document: { title: menuLabels[params.section] } };
  },
  component: Page,
});
function Page() {
  const search = Route.useSearch();
  const { section, draftId } = Route.useParams();
  return <MenuCollection search={search} section={section} draftId={draftId} />;
}
