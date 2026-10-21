import { createFileRoute } from "@tanstack/react-router";
import { PointPolicy } from "../features/rewards/point-policy";
import { pointPolicyOptions } from "../features/rewards/point-query";
export const Route = createFileRoute("/admin/stores/$storeId/points")({
  staticData: {
    document: { title: "customer_points_policy", description: "head_points_policy_description" },
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(pointPolicyOptions(params.storeId)),
  component: PointPolicy,
});
