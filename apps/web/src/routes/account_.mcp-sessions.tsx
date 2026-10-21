import { mcpSessionsOptions } from "../features/account/account-query";
import { createFileRoute } from "@tanstack/react-router";
import { McpSessions } from "../features/account/mcp-sessions";
export const Route = createFileRoute("/account_/mcp-sessions")({
  staticData: {
    document: { title: "mcp_oauth_sessions", description: "head_connections_description" },
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(mcpSessionsOptions),
  pendingComponent: () => <McpSessions />,
  component: McpSessions,
});
