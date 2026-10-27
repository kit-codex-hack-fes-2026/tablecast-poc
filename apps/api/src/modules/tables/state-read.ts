import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { CoreState, StateView, TableState } from "./model";
import { coreStateFromRows, coreStateQueries } from "./core-queries";
import { tableStateFromRows, tableStateQueries } from "./queries";

export type StateReadOperation = <
  T extends readonly [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
>(
  queries: T,
  decode: (rows: BatchResponse<T>) => Promise<CoreState | TableState>,
) => Promise<CoreState | TableState>;

// 確定batchへ後置する読取と、その同じ型の結果変換を対で渡す。
export function withStateRead(
  services: ApiServices,
  actor: Actor,
  view: StateView,
  operation: StateReadOperation,
) {
  return view === "core"
    ? operation(coreStateQueries(services, actor), (rows) =>
        coreStateFromRows(services, actor, rows),
      )
    : operation(tableStateQueries(services, actor), (rows) =>
        tableStateFromRows(services, actor, rows),
      );
}
