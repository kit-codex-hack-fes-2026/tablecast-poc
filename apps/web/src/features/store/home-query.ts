import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
import { floorOptions } from "../floor/floor-query";
export const homeOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-home", storeId],
    queryFn: async ({ signal, client }) => {
      const initial = await parseResponse(
        rpc.api.admin.initial.$get({ query: { storeId, view: "home" } }, { init: { signal } }),
      );
      const floor = initial.floor;
      if (floor)
        client.setQueryData(floorOptions(storeId).queryKey, (current) =>
          current && current.cursor > floor.cursor ? current : floor,
        );
      return initial.home;
    },
  });
