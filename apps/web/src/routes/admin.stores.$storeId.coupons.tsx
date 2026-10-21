import { createFileRoute } from "@tanstack/react-router";
import { CouponManagement } from "../features/store/coupon-management";
export const Route = createFileRoute("/admin/stores/$storeId/coupons")({
  staticData: { document: { title: "coupons", description: "head_coupons_manage_description" } },
  component: CouponManagement,
});
