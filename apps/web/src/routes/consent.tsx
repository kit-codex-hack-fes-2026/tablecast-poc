import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Consent } from "../features/admin/consent";

export const Route = createFileRoute("/consent")({
  component: () => (
    <ClientOnly>
      <Consent />
    </ClientOnly>
  ),
});
