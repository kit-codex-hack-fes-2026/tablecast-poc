import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DeviceApproval } from "../features/account/device";
import { collectionSearchFields } from "../features/shell/collection-model";
export const Route = createFileRoute("/device")({
  validateSearch: z.looseObject({ ...collectionSearchFields("approvalStores") }),
  staticData: {
    document: { title: "admin_pair", description: "head_device_approval_description" },
  },
  component: () => <DeviceApproval />,
});
