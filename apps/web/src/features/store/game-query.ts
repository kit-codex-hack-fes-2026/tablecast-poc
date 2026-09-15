import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";

export const gamesOptions = (storeId: string, after = "") =>
  queryOptions({
    queryKey: ["tablecast-games", storeId, after],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].games.$get(
          { param: { storeId }, query: { after } },
          { init: { signal } },
        ),
      ),
  });
export const gameOptions = (storeId: string, gameId: string) =>
  queryOptions({
    queryKey: ["tablecast-game", storeId, gameId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].games[":gameId"].$get(
          { param: { storeId, gameId } },
          { init: { signal } },
        ),
      ),
  });
