import type { CoreState } from "@tablecast/api/schema";
import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { DetailedError, parseResponse, type TableEndpoint } from "../../lib/api";
import { applyCartChange, type CartSubmission, cartSubmissionSchema } from "./cart-change-model";
import { latestTable } from "./table-cache";
import { tableOptions, tableQueryKey } from "./table-query";

/** Query cacheは確定値だけを持ち、待機中・失敗した操作はTanStack Queryが所有する。 */
export function useCartUpdates({
  data,
  endpoint,
  onStart,
  onSuccess,
}: {
  data: CoreState;
  endpoint: TableEndpoint;
  onStart: (input: CartSubmission) => void;
  onSuccess: (input: CartSubmission) => void;
}) {
  const client = useQueryClient();
  const queryKey = tableQueryKey(endpoint);
  const mutationKey = ["tablecast-cart-update", endpoint.key, data.id];
  const pending = useMutationState({
    filters: { mutationKey, status: "pending", exact: true },
    select: (mutation) => ({
      ...cartSubmissionSchema.parse(mutation.state.variables),
      order: mutation.mutationId,
    }),
  });
  const failures = useMutationState({
    filters: { mutationKey, status: "error", exact: true },
    select: (mutation) => ({
      mutationId: mutation.mutationId,
      input: cartSubmissionSchema.parse(mutation.state.variables),
      error: mutation.state.error,
    }),
  });
  const clearFailure = (mutationId: number) => {
    const failed = client
      .getMutationCache()
      .getAll()
      .find((item) => item.mutationId === mutationId);
    if (failed?.state.status === "error") client.getMutationCache().remove(failed);
  };
  const update = useMutation({
    mutationKey,
    scope: { id: `tablecast-presentation-${endpoint.key}-${data.id}` },
    onMutate: async (input: CartSubmission) => {
      await client.cancelQueries({ queryKey, exact: true });
      onStart(input);
    },
    mutationFn: async (input: CartSubmission) => {
      const state = client.getQueryState(queryKey);
      const current =
        state?.isInvalidated || state?.status === "error"
          ? await client.fetchQuery({ ...tableOptions(client, endpoint), staleTime: 0 })
          : client.getQueryData<CoreState>(queryKey);
      if (!current || current.id !== data.id || current.configVersion !== input.configVersion)
        throw new DetailedError("CART_CONFLICT", { statusCode: 409 });
      const change = input.change;
      const changedId = "line" in change ? change.line.id : change.id;
      if (change.type !== "add" && !current.cart.lines.some((line) => line.id === changedId))
        throw new DetailedError("CART_CONFLICT", { statusCode: 409 });
      return parseResponse(
        endpoint.client.cart.$put({
          query: { view: "core" },
          json: {
            expectedVersion: current.cart.version,
            lines: applyCartChange(current.cart.lines, input).map(
              ({ id, productId, quantity, selections }) => ({
                id,
                productId,
                quantity,
                selections,
              }),
            ),
            ...(input.dismissProductId ? { dismissProductId: input.dismissProductId } : {}),
          },
        }),
      );
    },
    onSuccess: (updated, input) => {
      client.setQueryData<CoreState>(queryKey, (current) => latestTable(current, updated));
      onSuccess(input);
    },
    onError: async () => {
      // 次の直列操作も、競合・応答消失後の古い版では送らない。
      await client.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
      try {
        await client.fetchQuery({ ...tableOptions(client, endpoint), staleTime: 0 });
      } catch {
        // 取得失敗はqueryへ残す。後続操作は再取得に成功するまで送信しない。
      }
    },
  });
  return {
    ...update,
    pending,
    failures,
    clearFailure,
    retry: (failure: (typeof failures)[number]) => {
      clearFailure(failure.mutationId);
      update.mutate(failure.input);
    },
  };
}
