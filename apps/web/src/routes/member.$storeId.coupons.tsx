import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CustomerCoupons } from "../features/customer/customer-coupons";
import {
  customerCouponsOptions,
  customerExchangesOptions,
} from "../features/customer/customer-coupons-query";
export const Route = createFileRoute("/member/$storeId/coupons")({
  staticData: { document: { title: "coupons", description: "head_customer_coupons_description" } },
  validateSearch: z.object({ sessionId: z.string().optional() }),
  loader: async ({ context, params }) => {
    // 片側の失敗をQueryに残し、取得できた一覧と個別の再試行を表示する。
    await Promise.allSettled([
      context.queryClient.ensureInfiniteQueryData(customerCouponsOptions(params.storeId)),
      context.queryClient.ensureInfiniteQueryData(customerExchangesOptions(params.storeId)),
    ]);
  },
  component: Page,
});
function Page() {
  const { storeId } = Route.useParams();
  const { sessionId } = Route.useSearch();
  return <CustomerCoupons storeId={storeId} sessionId={sessionId} />;
}
