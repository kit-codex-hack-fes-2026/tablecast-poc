import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Login } from "../features/admin/login";

export const Route = createFileRoute("/login")({
  component: () => (
    <ClientOnly>
      <Login />
    </ClientOnly>
  ),
});
