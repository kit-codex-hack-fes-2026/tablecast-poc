import { createFileRoute } from "@tanstack/react-router";
import { Kiosk } from "../features/kiosk/kiosk";

export const Route = createFileRoute("/")({ component: Kiosk });
