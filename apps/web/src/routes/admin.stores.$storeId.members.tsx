import { createFileRoute } from "@tanstack/react-router";
import { Members } from "../features/store/members";
export const Route = createFileRoute("/admin/stores/$storeId/members")({ component: Members });
