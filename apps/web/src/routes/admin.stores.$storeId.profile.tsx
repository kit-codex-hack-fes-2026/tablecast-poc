import { createFileRoute } from "@tanstack/react-router";
import { StoreProfile } from "../features/store/store-profile";
export const Route = createFileRoute("/admin/stores/$storeId/profile")({ component: StoreProfile });
