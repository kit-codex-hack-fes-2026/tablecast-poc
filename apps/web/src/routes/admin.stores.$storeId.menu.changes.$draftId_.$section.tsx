import { createFileRoute } from "@tanstack/react-router";
import { MenuCollection } from "../features/store/menu-collection";
import { menuListSearchSchema, menuSectionSchema } from "../features/store/menu-model";
import { catalogOptions, draftOptions, standardVoicesOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/$draftId_/$section")({
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
  },
  component: Page,
});
function Page() {
  const search = Route.useSearch();
  const { section, draftId } = Route.useParams();
  return <MenuCollection search={search} section={section} draftId={draftId} />;
}
