import { queryOptions } from "@tanstack/react-query";
import { authClient, authResult } from "../../lib/auth-client";
export const membershipOptions = (organizationId: string) =>
  queryOptions({
    queryKey: ["tablecast-membership", organizationId],
    queryFn: async ({ signal }) =>
      authResult(
        await authClient.organization.getFullOrganization({
          query: { organizationId },
          fetchOptions: { signal },
        }),
      ),
  });
