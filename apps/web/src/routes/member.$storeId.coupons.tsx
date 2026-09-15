import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CustomerCoupons } from "../features/customer/customer-coupons";
export const Route = createFileRoute("/member/$storeId/coupons")({
  validateSearch: z.object({ sessionId: z.string().optional() }),
  component: Page,
});
function Page() {
  const { storeId } = Route.useParams();
  const { sessionId } = Route.useSearch();
  return <CustomerCoupons storeId={storeId} sessionId={sessionId} />;
}
