import {
  type CoreState,
  type UiSection,
  type UiSectionInput,
  uiSectionInputSchema,
} from "@tablecast/api/schema";
import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { parseResponse, type TableEndpoint } from "../../lib/api";
import { latestTable } from "./table-cache";
import { tableQueryKey } from "./table-query";

// 卓の画面操作をMutation cacheへ保持し、確定値と順序を統合する。
export function useTablePresentation({
  data,
  endpoint,
  refresh,
  dismissals,
}: {
  data: CoreState;
  dismissals: { dismissProductId?: string; order: number }[];
  endpoint: TableEndpoint;
  refresh: () => void;
}) {
  const client = useQueryClient();
  const tableKey = tableQueryKey(endpoint);
  const screenKey = ["tablecast-ui-update", endpoint.key, data.id];
  const pendingScreens = useMutationState({
    filters: { mutationKey: screenKey, status: "pending", exact: true },
    select: (mutation) => ({
      ...uiSectionInputSchema.parse(mutation.state.variables),
      order: mutation.mutationId,
    }),
  });
  const screen = useMutation({
    mutationKey: screenKey,
    scope: { id: `tablecast-presentation-${endpoint.key}-${data.id}` },
    mutationFn: (input: UiSectionInput) =>
      parseResponse(endpoint.client.ui.$patch({ json: input, query: { view: "core" } })),
    onMutate: async () => {
      const cursor = client.getQueryData<CoreState>(tableKey)?.cursor ?? data.cursor;
      await client.cancelQueries({ queryKey: tableKey, exact: true });
      return { cursor };
    },
    onSuccess: (updated) =>
      client.setQueryData<CoreState>(tableKey, (current) => latestTable(current, updated)),
    onError: refresh,
  });
  // Mutationの完了通知が親のQuery描画より先でも、確定した画面を一瞬戻さない。
  const cached = client.getQueryData<CoreState>(tableKey);
  const confirmed = cached?.id === data.id ? latestTable(data, cached) : data;
  const { mutate: changeScreen } = screen;
  const previousConfigVersion = useRef(data.configVersion);
  useEffect(() => {
    if (previousConfigVersion.current !== data.configVersion) {
      previousConfigVersion.current = data.configVersion;
      changeScreen({ section: "menu", productId: null });
    }
  }, [data.configVersion, changeScreen]);
  const presentation = [
    ...pendingScreens,
    ...(screen.isError &&
    screen.variables?.search !== undefined &&
    confirmed.cursor <= (screen.context?.cursor ?? confirmed.cursor)
      ? [{ ...screen.variables, order: Number.MAX_SAFE_INTEGER }]
      : []),
    ...dismissals
      .filter((input) => input.dismissProductId)
      .map((input) => ({
        section: undefined,
        search: undefined,
        productId: input.dismissProductId,
        order: input.order,
      })),
  ]
    .toSorted((left, right) => left.order - right.order)
    .reduce<{ productId: null | string; search: UiSectionInput["search"]; section: UiSection }>(
      (current, input) =>
        input.section
          ? {
              section: input.section,
              productId: input.productId ?? null,
              search: input.search === undefined ? current.search : input.search,
            }
          : current.productId === input.productId
            ? { ...current, productId: null }
            : current,
      {
        section: confirmed.uiSection,
        productId: confirmed.selectedProductId,
        search: confirmed.menuSearch,
      },
    );
  return { screen, presentation };
}
