import { createFileRoute } from "@tanstack/react-router";
import { Floor } from "../features/store/floor";
export const Route = createFileRoute("/admin/stores/$storeId/floor")({ component: Floor });
