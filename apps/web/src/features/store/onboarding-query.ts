import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse, rpc } from "../../lib/api";
const onboarding = rpc.api.admin.stores[":storeId"].onboarding;
export type OnboardingData = InferResponseType<typeof onboarding.$get, 200>;
export const onboardingOptions = (storeId: string, draftId?: string) =>
  queryOptions({
    staleTime: 5000,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    queryKey: ["tablecast-onboarding", storeId, draftId],
    queryFn: ({ signal }) =>
      parseResponse(
        onboarding.$get({ param: { storeId }, query: { draftId } }, { init: { signal } }),
      ),
  });
