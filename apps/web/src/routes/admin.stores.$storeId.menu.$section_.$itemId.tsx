import { createFileRoute } from "@tanstack/react-router";
import { MenuItem } from "../features/store/menu-item";
import { menuSectionSchema } from "../features/store/menu-model";
import { catalogOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/$section_/$itemId")({
  params: { parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }) },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(catalogOptions(params.storeId));
  },
  component: Page,
});
function Page() {
  const { section, itemId } = Route.useParams();
  return <MenuItem section={section} itemId={itemId} />;
}
