import { createFileRoute } from "@tanstack/react-router";
import { CouponManagement } from "../features/store/coupon-management";
export const Route = createFileRoute("/admin/stores/$storeId/coupons")({
  component: CouponManagement,
});
