import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Account } from "../features/account/account";
export const Route = createFileRoute("/account")({
  component: () => (
    <ClientOnly>
      <Account />
    </ClientOnly>
  ),
});
