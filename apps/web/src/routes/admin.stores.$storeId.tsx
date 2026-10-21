import { createFileRoute } from "@tanstack/react-router";
import { storesOptions } from "../features/store/store-query";
import { StoreShell } from "../features/store/store-shell";
export const Route = createFileRoute("/admin/stores/$storeId")({
  staticData: { document: { title: "home_title", description: "head_home_description" } },
  loader: ({ context, params }) => ({
    document: {
      store: context.queryClient
        .getQueryData(storesOptions.queryKey)
        ?.stores.find((store) => store.id === params.storeId)?.name,
    },
  }),
  pendingComponent: () => <StoreRoute />,
  component: () => <StoreRoute />,
});
function StoreRoute() {
  const { storeId } = Route.useParams();
  return <StoreShell storeId={storeId} />;
}
