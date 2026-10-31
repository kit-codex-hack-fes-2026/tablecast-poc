import type { CoreState, OrderPage, TableEvent } from "@tablecast/api/schema";
export function latestTable(current: CoreState | null | undefined, incoming: CoreState) {
  return current?.id === incoming.id &&
    (current.cursor > incoming.cursor || current.cart.version > incoming.cart.version)
    ? current
    : incoming;
}

// coreと履歴のcursorを独立に比較し、自己更新の応答が他端末の履歴通知を隠さない。
export function affectedTableQueries(
  events: TableEvent[],
  core: CoreState | null | undefined,
  history: OrderPage | undefined,
) {
  return {
    core: events.some(
      (event) =>
        event.cursor > (core?.cursor ?? 0) &&
        !(event.kind === "confirmation.prepared" && event.data.snapshotId === core?.snapshot?.id) &&
        (!event.kind.startsWith("voice.") ||
          ["voice.started", "voice.stopped", "voice.speed"].includes(event.kind)),
    ),
    orders: events.some((event) => {
      if (event.cursor <= (history?.cursor ?? 0)) return false;
      if (event.kind === "demo.reset") return true;
      if (!event.kind.startsWith("order.")) return false;
      const known = history?.orders.find((order) => order.id === event.data.orderId);
      return event.kind === "order.submitted"
        ? !known
        : !known || known.status !== event.data.status;
    }),
  };
}
