import type { CartLine } from "@tablecast/api/schema";
import { skipToken, useQuery } from "@tanstack/react-query";
import { parseResponse, type TableEndpoint } from "../../lib/api";

export function useProductFoodInformation({
  productId,
  selections,
  endpoint,
  configVersion,
  tableSessionId,
}: {
  configVersion: number;
  endpoint?: TableEndpoint;
  productId: string;
  selections: CartLine["selections"];
  tableSessionId: string;
}) {
  return useQuery({
    queryKey: [
      "tablecast-food-information",
      endpoint?.key,
      tableSessionId,
      configVersion,
      productId,
      selections,
    ],
    queryFn: endpoint
      ? ({ signal }) =>
          parseResponse(
            endpoint.client.catalog["food-information"].$post(
              { json: { productId, selections } },
              { init: { signal } },
            ),
          )
      : skipToken,
    placeholderData: (previous, query) =>
      query !== undefined &&
      endpoint !== undefined &&
      query.queryKey[1] === endpoint.key &&
      query.queryKey[2] === tableSessionId &&
      query.queryKey[3] === configVersion &&
      query.queryKey[4] === productId
        ? previous
        : undefined,
    staleTime: Infinity,
    retry: false,
  });
}

export type ProductFoodQuery = ReturnType<typeof useProductFoodInformation>;
