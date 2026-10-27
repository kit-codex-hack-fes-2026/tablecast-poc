import type { TableState } from "@tablecast/api/schema";
export function latestTable(current: null | TableState | undefined, incoming: TableState) {
  return current?.id === incoming.id &&
    (current.cursor > incoming.cursor || current.cart.version > incoming.cart.version)
    ? current
    : incoming;
}
