import { createFileRoute } from "@tanstack/react-router";
import { MenuCollection } from "../features/store/menu-collection";
import { menuSectionSchema } from "../features/store/menu-model";
import { catalogOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/$section")({
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(catalogOptions(params.storeId));
  },
  component: Page,
});
function Page() {
  const { section } = Route.useParams();
  return <MenuCollection section={section} />;
}
