import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "../../lib/api";
import { parseResponse, rpc } from "../../lib/api";
const endpoint = rpc.api.admin.organizations[":organizationId"].billing;
export type Billing = InferResponseType<typeof endpoint.$get, 200>;
export const billingOptions = (organizationId: string, month?: string, search?: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-billing", organizationId, month, search],
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        endpoint.$get(
          { param: { organizationId }, query: { month, before: pageParam, search } },
          { init: { signal } },
        ),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next ?? undefined,
    placeholderData: (previous, query) =>
      query?.queryKey[1] === organizationId ? previous : undefined,
    staleTime: 0,
    refetchInterval: 30000,
  });
export type Invoice = InferResponseType<typeof endpoint.invoices.$get, 200>["invoices"][number];
export const invoiceOptions = (organizationId: string, before?: string) =>
  queryOptions({
    queryKey: ["tablecast-invoices", organizationId, before],
    queryFn: ({ signal }) =>
      parseResponse(
        endpoint.invoices.$get(
          { param: { organizationId }, query: { before } },
          { init: { signal } },
        ),
      ),
  });
