import { createFileRoute } from "@tanstack/react-router";
import { DeviceApproval } from "../features/account/device";
export const Route = createFileRoute("/device")({
  staticData: {
    document: { title: "admin_pair", description: "head_device_approval_description" },
  },
  component: () => <DeviceApproval />,
});
