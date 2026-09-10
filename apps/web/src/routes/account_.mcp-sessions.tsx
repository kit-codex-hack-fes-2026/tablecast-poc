import { mcpSessionsOptions } from "../features/account/account-query";
import { createFileRoute } from "@tanstack/react-router";
import { McpSessions } from "../features/account/mcp-sessions";
export const Route = createFileRoute("/account_/mcp-sessions")({
  loader: ({ context }) => context.queryClient.ensureQueryData(mcpSessionsOptions),
  component: () => <McpSessions />,
});
