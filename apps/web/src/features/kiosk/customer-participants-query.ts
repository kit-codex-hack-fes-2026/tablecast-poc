import { queryOptions } from "@tanstack/react-query";
import { parseResponse, type TableEndpoint } from "../../lib/api";

export const customerParticipantsKey = (endpoint: TableEndpoint, sessionId: string) => [
  "tablecast-participants",
  sessionId,
  endpoint.key,
];

export const customerParticipantsOptions = (
  endpoint: TableEndpoint,
  sessionId: string,
  cursor: number,
) =>
  queryOptions({
    queryKey: [...customerParticipantsKey(endpoint, sessionId), cursor],
    queryFn: ({ signal }) =>
      parseResponse(endpoint.client.participants.$get({}, { init: { signal } })),
    staleTime: 30_000,
    gcTime: 30_000,
  });

export const customerTargetKey = (endpoint: TableEndpoint, sessionId: string) => [
  "tablecast-customer-target",
  sessionId,
  endpoint.key,
];
