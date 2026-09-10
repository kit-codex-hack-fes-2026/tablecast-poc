import { createFileRoute } from "@tanstack/react-router";
import { EmailAccess } from "../features/account/email-access";
export const Route = createFileRoute("/reset-password")({
  component: () => <EmailAccess />,
});
