import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
const endpoint = rpc.api.admin.organizations[":organizationId"].billing;
const loadBilling = (
  organizationId: string,
  month?: string,
  before?: string,
  search?: string,
  signal?: AbortSignal,
) =>
  parseResponse(
    endpoint.$get(
      { param: { organizationId }, query: { month, before, search } },
      { init: { signal } },
    ),
  );
export type Billing = Awaited<ReturnType<typeof loadBilling>>;
export const billingOptions = (organizationId: string, month?: string, search?: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-billing", organizationId, month, search],
    queryFn: ({ pageParam, signal }) =>
      loadBilling(organizationId, month, pageParam, search, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next ?? undefined,
    placeholderData: (previous, query) =>
      query?.queryKey[1] === organizationId ? previous : undefined,
    staleTime: 0,
    refetchInterval: 30000,
  });
const loadInvoices = (organizationId: string, before?: string, signal?: AbortSignal) =>
  parseResponse(
    endpoint.invoices.$get({ param: { organizationId }, query: { before } }, { init: { signal } }),
  );
export type Invoice = Awaited<ReturnType<typeof loadInvoices>>["invoices"][number];
export const invoiceOptions = (organizationId: string, before?: string) =>
  queryOptions({
    queryKey: ["tablecast-invoices", organizationId, before],
    queryFn: ({ signal }) => loadInvoices(organizationId, before, signal),
  });
