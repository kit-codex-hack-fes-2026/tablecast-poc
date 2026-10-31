import { type CoreState, type StaffCallPage, staffCallPageSchema } from "@tablecast/api/schema";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { parseResponse, type TableEndpoint } from "../../lib/api";

export const staffCallsKey = (endpoint: TableEndpoint, sessionId: string) => [
  "tablecast-staff-calls",
  endpoint.key,
  sessionId,
];
export const staffCallsOptions = (endpoint: TableEndpoint, sessionId: string) =>
  infiniteQueryOptions({
    queryKey: staffCallsKey(endpoint, sessionId),
    initialPageParam: null as StaffCallPage["nextCursor"],
    queryFn: async ({ pageParam, signal }) =>
      staffCallPageSchema.parse(
        await parseResponse(
          endpoint.client.calls.$get(
            {
              query: {
                limit: "20",
                ...(pageParam
                  ? { beforeCreatedAt: String(pageParam.createdAt), beforeId: pageParam.id }
                  : {}),
              },
            },
            { init: { signal } },
          ),
        ),
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
export const guidanceOptions = (
  endpoint: TableEndpoint,
  data: CoreState,
  input: { guideId?: string; query?: string },
) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-guidance", endpoint.key, data.id, data.configVersion, data.locale, input],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        endpoint.client.guidance.$get(
          { query: { ...input, offset: String(pageParam) } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextOffset,
  });
