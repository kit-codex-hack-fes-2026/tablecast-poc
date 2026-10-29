import { createFileRoute } from "@tanstack/react-router";
import { posSettingsOptions } from "../features/pos/pos-query";
import { StorePos } from "../features/pos/store-pos";

export const Route = createFileRoute("/admin/stores/$storeId/pos")({
  staticData: { document: { title: "pos_title", description: "pos_intro" } },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(posSettingsOptions(params.storeId));
  },
  component: StorePos,
});
