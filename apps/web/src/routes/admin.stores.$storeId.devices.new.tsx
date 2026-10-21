import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RegisterDevice } from "../features/devices/devices";
import { devicesOptions } from "../features/devices/devices-query";
import { collectionSearchSchema } from "../features/shell/collection-model";
export const Route = createFileRoute("/admin/stores/$storeId/devices/new")({
  staticData: {
    document: { title: "admin_pair", description: "head_device_register_description" },
  },
  validateSearch: collectionSearchSchema.extend({
    user_code: z.string().default(""),
    tableId: z.string().optional(),
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(devicesOptions(params.storeId));
  },
  component: Page,
});
function Page() {
  const { user_code, tableId } = Route.useSearch();
  return <RegisterDevice userCode={user_code} tableId={tableId} />;
}
