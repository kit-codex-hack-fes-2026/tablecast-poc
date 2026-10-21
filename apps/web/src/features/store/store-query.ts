import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "../../lib/api";
import { parseResponse, rpc } from "../../lib/api";
export type Store = InferResponseType<typeof rpc.api.admin.stores.$get, 200>["stores"][number];
export const storesOptions = queryOptions({
  queryKey: ["tablecast-stores"],
  queryFn: ({ signal }) => parseResponse(rpc.api.admin.stores.$get({}, { init: { signal } })),
});

/** loader用の初回lookup。画面の背景更新はStoreShellのquery購読へ任せる。 */
export const findStore = async (client: QueryClient, storeId: string) =>
  (await client.ensureQueryData(storesOptions)).stores.find((store) => store.id === storeId);

export const isStoreManager = (store: Store | undefined): store is Store =>
  store !== undefined && (store.role === "owner" || store.role === "admin");
