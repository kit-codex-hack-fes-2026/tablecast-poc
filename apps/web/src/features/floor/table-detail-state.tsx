import type { Order } from "@tablecast/api/schema";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useI18n } from "../../i18n/locale";
import { parseResponse, rpc } from "../../lib/api";
import { useRealtime } from "../../lib/use-realtime";
import { tableDetailOptions } from "./floor-query";

export function useTableDetail({
  storeId,
  tableId,
}: {
  onViewChange: (view: "billing" | "diagnostics" | "logs" | "orders" | "overview") => void;
  storeId: string;
  tableId: string;
  view: "billing" | "diagnostics" | "logs" | "orders" | "overview";
}) {
  const { t, locale } = useI18n();
  const route = rpc.api.admin.stores[":storeId"];
  const param = { storeId, id: tableId };
  const detail = useSuspenseQuery(tableDetailOptions(storeId, tableId));
  const client = useQueryClient();
  useRealtime(detail.data.status === "open" ? { storeId } : undefined, detail.data.cursor, () => {
    void client.invalidateQueries({ queryKey: ["tablecast-table-detail", storeId, tableId] });
    void client.invalidateQueries({ queryKey: ["tablecast-session-events", storeId, tableId] });
  });
  const action = useMutation({
    mutationFn: async (
      operation:
        | { id: string; kind: "order"; status: Exclude<Order["status"], "submitted"> }
        | { kind: "close" }
        | { kind: "resolve" },
    ) => {
      if (operation.kind === "close")
        return parseResponse(route.tables[":id"].close.$post({ param }));
      if (operation.kind === "resolve")
        return parseResponse(route.tables[":id"].call.resolve.$post({ param }));
      return parseResponse(
        route.orders[":id"].status.$post({
          param: { storeId, id: operation.id },
          json: { status: operation.status },
        }),
      );
    },
    onSuccess: () => {
      void detail.refetch();
    },
  });
  function orderStatus(order: Order, status: Exclude<Order["status"], "submitted">) {
    action.mutate({ kind: "order", id: order.id, status });
  }
  const table = detail.data;
  return {
    t,
    locale,
    detail,
    action,
    orderStatus,
    table,
  };
}
