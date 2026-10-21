import { z } from "zod";
import { collectionSearchFields } from "../features/shell/collection-model";
import { createFileRoute } from "@tanstack/react-router";
import { DeviceApproval } from "../features/account/device";
export const Route = createFileRoute("/device")({
  validateSearch: z.looseObject({ ...collectionSearchFields("approvalStores") }),
  staticData: {
    document: { title: "admin_pair", description: "head_device_approval_description" },
  },
  component: () => <DeviceApproval />,
});
