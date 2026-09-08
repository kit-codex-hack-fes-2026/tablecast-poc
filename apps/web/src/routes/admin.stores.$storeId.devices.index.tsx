import { createFileRoute } from "@tanstack/react-router";
import { Devices } from "../features/store/devices";
export const Route = createFileRoute("/admin/stores/$storeId/devices/")({ component: Devices });
