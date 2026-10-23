import { createFileRoute } from "@tanstack/react-router";
import { findStore } from "../features/store/store-query";
import { StoreShell } from "../features/store/store-shell";
export const Route = createFileRoute("/admin/stores/$storeId")({
  staticData: { document: { title: "home_title", description: "head_home_description" } },
  beforeLoad: async ({ context, params }) => ({
    store: await findStore(context.queryClient, params.storeId),
  }),
  loader: ({ context }) => ({ document: { store: context.store?.name } }),
  pendingComponent: () => <StoreRoute />,
  component: () => <StoreRoute />,
});
function StoreRoute() {
  const { storeId } = Route.useParams();
  return <StoreShell storeId={storeId} />;
}
