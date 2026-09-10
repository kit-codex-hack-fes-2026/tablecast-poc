import { createFileRoute } from "@tanstack/react-router";
import { DeviceApproval } from "../features/account/device";
export const Route = createFileRoute("/device")({
  component: () => <DeviceApproval />,
});
