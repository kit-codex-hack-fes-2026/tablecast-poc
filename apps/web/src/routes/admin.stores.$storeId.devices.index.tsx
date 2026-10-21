import { createFileRoute } from "@tanstack/react-router";
import { Devices } from "../features/store/devices";
import { devicesOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId/devices/")({
  staticData: { document: { title: "device_title", description: "head_devices_description" } },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(devicesOptions(params.storeId));
  },
  component: Devices,
});
