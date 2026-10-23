import { createFileRoute } from "@tanstack/react-router";
import { EmailAccess } from "../features/account/email-access";
export const Route = createFileRoute("/register")({
  staticData: { document: { title: "auth_sign_in", description: "head_login_description" } },
  component: () => <EmailAccess register />,
});
