import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { EmailAccess } from "../features/account/email-access";
export const Route = createFileRoute("/reset-password")({
  component: () => (
    <ClientOnly>
      <EmailAccess />
    </ClientOnly>
  ),
});
