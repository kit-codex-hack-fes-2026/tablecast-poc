import { createFileRoute } from "@tanstack/react-router";
import { mcpSessionsOptions } from "../features/account/account-query";
import { McpSessions } from "../features/account/mcp-sessions";
import { collectionSearchSchema } from "../features/shell/collection-model";
export const Route = createFileRoute("/account_/mcp-sessions")({
  validateSearch: collectionSearchSchema,
  staticData: {
    document: { title: "mcp_oauth_sessions", description: "head_connections_description" },
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(mcpSessionsOptions),
  pendingComponent: () => <McpSessions />,
  component: McpSessions,
});
