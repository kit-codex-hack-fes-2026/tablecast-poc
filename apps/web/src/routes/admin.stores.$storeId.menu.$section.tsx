import { createFileRoute } from "@tanstack/react-router";
import { MenuCollection } from "../features/store/menu-collection";
import { menuListSearchSchema, menuSectionSchema } from "../features/store/menu-model";
import { catalogOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/$section")({
  validateSearch: menuListSearchSchema,
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(catalogOptions(params.storeId));
  },
  pendingComponent: () => <Page />,
  component: () => <Page />,
});
function Page() {
  const search = Route.useSearch();
  const { section } = Route.useParams();
  return <MenuCollection search={search} section={section} />;
}
