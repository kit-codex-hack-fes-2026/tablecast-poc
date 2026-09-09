import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { McpSessions } from "../features/account/mcp-sessions";
export const Route = createFileRoute("/account_/mcp-sessions")({
  component: () => (
    <ClientOnly>
      <McpSessions />
    </ClientOnly>
  ),
});
