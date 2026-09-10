import { createFileRoute } from "@tanstack/react-router";
import { StoreShell } from "../features/store/store-shell";
export const Route = createFileRoute("/admin/stores/$storeId")({ component: StoreRoute });
function StoreRoute() {
  const { storeId } = Route.useParams();
  return <StoreShell storeId={storeId} />;
}
