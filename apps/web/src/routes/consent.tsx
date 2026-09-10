import { createFileRoute } from "@tanstack/react-router";
import { Consent } from "../features/account/consent";

export const Route = createFileRoute("/consent")({
  component: () => <Consent />,
});
