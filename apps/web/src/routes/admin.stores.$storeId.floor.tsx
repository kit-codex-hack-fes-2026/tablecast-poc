import { createFileRoute } from "@tanstack/react-router";
import { Floor } from "../features/store/floor";
import { floorOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId/floor")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(floorOptions(params.storeId));
  },
  component: Floor,
});
