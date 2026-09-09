import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { StoreShell } from "../features/store/store-shell";
export const Route = createFileRoute("/admin/stores/$storeId")({ component: StoreRoute });
function StoreRoute() {
  const { storeId } = Route.useParams();
  return (
    <ClientOnly>
      <StoreShell storeId={storeId} />
    </ClientOnly>
  );
}
