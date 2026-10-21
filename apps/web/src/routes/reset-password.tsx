import { createFileRoute } from "@tanstack/react-router";
import { EmailAccess } from "../features/account/email-access";
export const Route = createFileRoute("/reset-password")({
  staticData: { document: { title: "auth_reset", description: "head_reset_description" } },
  component: () => <EmailAccess />,
});
