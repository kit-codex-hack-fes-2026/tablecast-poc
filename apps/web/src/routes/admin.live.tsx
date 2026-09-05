import { createFileRoute } from "@tanstack/react-router";
import { Admin } from "../features/admin/admin";

export const Route = createFileRoute("/admin/live")({ component: Admin });
