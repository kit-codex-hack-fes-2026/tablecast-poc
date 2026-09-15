import { createFileRoute } from "@tanstack/react-router";
import { PointPolicy } from "../features/store/point-policy";
import { pointPolicyOptions } from "../features/store/point-query";
export const Route = createFileRoute("/admin/stores/$storeId/points")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(pointPolicyOptions(params.storeId)),
  component: PointPolicy,
});
