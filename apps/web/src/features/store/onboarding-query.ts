import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const onboardingOptions = (storeId: string, draftId?: string) =>
  queryOptions({
    queryKey: ["tablecast-onboarding", storeId, draftId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].onboarding.$get(
          { param: { storeId }, query: { draftId } },
          { init: { signal } },
        ),
      ),
  });
