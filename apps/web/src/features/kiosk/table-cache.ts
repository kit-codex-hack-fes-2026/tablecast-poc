import type { TableState } from "@tablecast/api/schema";
export function latestTable(current: TableState | undefined | null, incoming: TableState) {
  return current?.id === incoming.id && current.cursor > incoming.cursor ? current : incoming;
}
