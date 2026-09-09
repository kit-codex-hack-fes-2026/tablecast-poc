import { parseResponse, rpc } from "../../lib/api";
import { queryOptions } from "@tanstack/react-query";
import { authClient, authResult } from "../../lib/auth-client";
export const accountSessionsOptions = queryOptions({
  queryKey: ["tablecast-account", "sessions"],
  queryFn: async () => authResult(await authClient.listSessions()),
});
export const accountLinksOptions = queryOptions({
  queryKey: ["tablecast-account", "links"],
  queryFn: async () => authResult(await authClient.listAccounts()),
});
export const accountKeysOptions = queryOptions({
  queryKey: ["tablecast-account", "passkeys"],
  queryFn: async () => authResult(await authClient.passkey.listUserPasskeys()),
});

export const loadMcpSessions = (signal?: AbortSignal) =>
  parseResponse(rpc.api.account["mcp-sessions"].$get({}, { init: { signal } }));
export const mcpSessionsOptions = queryOptions({
  queryKey: ["tablecast-mcp-sessions"],
  queryFn: ({ signal }) => loadMcpSessions(signal),
});
