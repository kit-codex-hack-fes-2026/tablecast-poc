import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse, rpc } from "../../lib/api";

export type MemberLoginBranding = InferResponseType<
  (typeof rpc.api)["member-visits"]["branding"]["$post"],
  200
>;

export const memberLoginBrandingOptions = (code: string) =>
  queryOptions({
    queryKey: ["tablecast-customer", "login-branding", code],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api["member-visits"].branding.$post({ json: { code } }, { init: { signal } }),
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

export const memberStoreLoginBrandingOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-member-store-identity", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api["member-stores"][":storeId"].identity.$get(
          { param: { storeId } },
          { init: { signal } },
        ),
      ),
    staleTime: 60_000,
    retry: false,
  });
