import { createFileRoute } from "@tanstack/react-router";
import { EmailAccess } from "../features/account/email-access";
export const Route = createFileRoute("/register")({
  staticData: { document: { title: "auth_register", description: "head_register_description" } },
  component: () => <EmailAccess register />,
});
